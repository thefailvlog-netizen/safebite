/**
 * SafeBite — DineSafe ETL Sync
 *
 * Fetches restaurant inspection data from the Toronto Open Data (DineSafe) API
 * and upserts it into the Supabase database.
 *
 * Data source: https://open.toronto.ca/dataset/dinesafe/
 * API: Toronto CKAN datastore
 *
 * Notes on DineSafe data quirks:
 * - "Inspection ID" is often the string "None" or "null" — we synthesize
 *   a stable key from (EstablishmentID_Date_Type) when this happens.
 * - Each row represents one infraction; a clean inspection has one row
 *   with no infraction detail.
 *
 * Designed for nightly incremental updates, not full historical seeds.
 * For the initial full seed, use scripts/seed-dinesafe.ts locally.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CKAN_BASE =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const PACKAGE_ID = "dinesafe";
const PAGE_SIZE = 1000;

/** Returns true if a value is null-like (null, undefined, "None", "null", "") */
function isNullLike(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return s === "" || s === "None" || s === "null" || s === "undefined";
}

function nullOrString(val: unknown): string | null {
  return isNullLike(val) ? null : String(val).trim();
}

function nullOrFloat(val: unknown): number | null {
  if (isNullLike(val)) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function nullOrDate(val: unknown): string | null {
  if (isNullLike(val)) return null;
  try {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

interface DineSafeRow {
  _id: number;
  "Establishment ID": number | null;
  "Establishment Name": string | null;
  "Establishment Type": string | null;
  "Establishment Address": string | null;
  Latitude: string | null;
  Longitude: string | null;
  "Inspection ID": number | string | null;
  "Inspection Date": string | null;
  "Inspection Type": string | null;
  "Establishment Status": string | null;
  "Infraction Details": string | null;
  Severity: string | null;
  Action: string | null;
  "Outcome Type": string | null;
  "Amount Fined": string | null;
  "Court Date": string | null;
}

interface SyncStats {
  totalRows: number;
  establishmentsUpserted: number;
  inspectionsUpserted: number;
  infractionsInserted: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Require a shared secret so the function can't be triggered by anyone
  // who discovers the URL. Set SYNC_SECRET in the Supabase Edge Function secrets.
  // The pg_cron trigger must pass: Authorization: Bearer <SYNC_SECRET>
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (syncSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${syncSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stats: SyncStats = {
    totalRows: 0,
    establishmentsUpserted: 0,
    inspectionsUpserted: 0,
    infractionsInserted: 0,
    errors: [],
  };

  try {
    // ── Step 1: Discover the active DineSafe resource ─────────────────────
    const pkgRes = await fetch(`${CKAN_BASE}/package_show?id=${PACKAGE_ID}`);
    const pkgData = await pkgRes.json();
    if (!pkgData.success) throw new Error("Failed to fetch DineSafe package");

    const resources = pkgData.result.resources as Array<{
      id: string;
      name: string;
      datastore_active: boolean;
      last_modified: string;
    }>;

    const resource = resources
      .filter((r) => r.datastore_active)
      .sort(
        (a, b) =>
          new Date(b.last_modified).getTime() -
          new Date(a.last_modified).getTime()
      )[0];

    if (!resource) throw new Error("No active DineSafe datastore resource");
    console.log(`Resource: ${resource.id} — ${resource.name}`);

    // ── Step 2: Paginate and fetch all rows ───────────────────────────────
    let offset = 0;
    let total = Infinity;
    const allRows: DineSafeRow[] = [];

    while (offset < total) {
      const res = await fetch(
        `${CKAN_BASE}/datastore_search?id=${resource.id}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const data = await res.json();
      if (!data.success) throw new Error(`Fetch failed at offset ${offset}`);

      total = data.result.total;
      allRows.push(...data.result.records);
      offset += PAGE_SIZE;
      console.log(`Fetched ${allRows.length}/${total}`);

      if (allRows.length > 500_000) break; // safety valve
    }

    stats.totalRows = allRows.length;

    // ── Step 3: Group by establishment and inspection ─────────────────────
    // Synthesize a stable inspection key when Inspection ID is null-like.
    const establishmentMap = new Map<string, DineSafeRow>();
    const inspectionMap = new Map<string, DineSafeRow[]>();

    for (const row of allRows) {
      const estId = isNullLike(row["Establishment ID"])
        ? null
        : String(row["Establishment ID"]);
      if (!estId) continue;

      if (!establishmentMap.has(estId)) {
        establishmentMap.set(estId, row);
      }

      // Build a stable inspection key
      const rawInspId = row["Inspection ID"];
      const inspId = isNullLike(rawInspId)
        ? `synth_${estId}_${nullOrDate(row["Inspection Date"]) ?? "nodate"}_${nullOrString(row["Inspection Type"]) ?? "notype"}`
        : String(rawInspId);

      if (!inspectionMap.has(inspId)) inspectionMap.set(inspId, []);
      inspectionMap.get(inspId)!.push(row);
    }

    // ── Step 4: Upsert establishments ─────────────────────────────────────
    const BATCH = 500;
    const estRows = Array.from(establishmentMap.values()).map((row) => ({
      external_id: String(row["Establishment ID"]),
      name: nullOrString(row["Establishment Name"]) ?? "",
      address: nullOrString(row["Establishment Address"]),
      city: "Toronto",
      province: "ON",
      lat: nullOrFloat(row.Latitude),
      lng: nullOrFloat(row.Longitude),
      category: nullOrString(row["Establishment Type"]),
      status: nullOrString(row["Establishment Status"]),
      source: "dinesafe",
    }));

    for (let i = 0; i < estRows.length; i += BATCH) {
      const { error } = await supabase
        .from("establishments")
        .upsert(estRows.slice(i, i + BATCH), { onConflict: "external_id" });
      if (error) stats.errors.push(`est batch ${i}: ${error.message}`);
      else stats.establishmentsUpserted += Math.min(BATCH, estRows.length - i);
    }
    console.log(`Establishments: ${stats.establishmentsUpserted}`);

    // ── Step 5: Load establishment UUID map ───────────────────────────────
    const { data: estRecs, error: estErr } = await supabase
      .from("establishments")
      .select("id, external_id");
    if (estErr) throw new Error(`est UUID fetch: ${estErr.message}`);
    const estIdMap = new Map(
      (estRecs ?? []).map((r: { id: string; external_id: string }) => [
        r.external_id,
        r.id,
      ])
    );

    // ── Step 6: Upsert inspections ────────────────────────────────────────
    const inspRows = [];
    const infractionQueue: Array<{
      inspKey: string;
      row: DineSafeRow;
    }> = [];

    for (const [inspKey, rows] of inspectionMap.entries()) {
      const first = rows[0];
      const estId = String(first["Establishment ID"]);
      const estUuid = estIdMap.get(estId);
      if (!estUuid) continue;

      const date = nullOrDate(first["Inspection Date"]);
      if (!date) continue;

      inspRows.push({
        establishment_id: estUuid,
        external_id: inspKey,
        inspection_date: date,
        inspection_type: nullOrString(first["Inspection Type"]),
        outcome: nullOrString(first["Outcome Type"]),
        source: "dinesafe",
      });

      for (const row of rows) {
        if (!isNullLike(row["Infraction Details"])) {
          infractionQueue.push({ inspKey, row });
        }
      }
    }

    for (let i = 0; i < inspRows.length; i += BATCH) {
      const { error } = await supabase
        .from("inspections")
        .upsert(inspRows.slice(i, i + BATCH), {
          onConflict: "establishment_id,external_id",
        });
      if (error) stats.errors.push(`insp batch ${i}: ${error.message}`);
      else stats.inspectionsUpserted += Math.min(BATCH, inspRows.length - i);
    }
    console.log(`Inspections: ${stats.inspectionsUpserted}`);

    // ── Step 7: Load inspection UUID map ──────────────────────────────────
    const { data: inspRecs, error: inspErr } = await supabase
      .from("inspections")
      .select("id, external_id");
    if (inspErr) throw new Error(`insp UUID fetch: ${inspErr.message}`);
    const inspIdMap = new Map(
      (inspRecs ?? []).map((r: { id: string; external_id: string }) => [
        r.external_id,
        r.id,
      ])
    );

    // ── Step 8: Upsert infractions ────────────────────────────────────────
    const infrRows = infractionQueue
      .map(({ inspKey, row }) => {
        const inspUuid = inspIdMap.get(inspKey);
        if (!inspUuid) return null;
        return {
          inspection_id: inspUuid,
          external_id: String(row._id),
          infraction_text: nullOrString(row["Infraction Details"]),
          severity: nullOrString(row.Severity),
          action: nullOrString(row.Action),
          amount: nullOrFloat(row["Amount Fined"]),
          court_date: nullOrDate(row["Court Date"]),
          source: "dinesafe",
        };
      })
      .filter(Boolean);

    for (let i = 0; i < infrRows.length; i += BATCH) {
      const { error } = await supabase
        .from("infractions")
        .upsert(infrRows.slice(i, i + BATCH), {
          onConflict: "inspection_id,external_id",
          ignoreDuplicates: true,
        });
      if (error) stats.errors.push(`infr batch ${i}: ${error.message}`);
      else stats.infractionsInserted += Math.min(BATCH, infrRows.length - i);
    }
    console.log(`Infractions: ${stats.infractionsInserted}`);

    // ── Step 9: Update PostGIS locations ─────────────────────────────────
    await supabase.rpc("update_establishment_locations");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Fatal: ${msg}`);
    console.error("Sync error:", msg);
  }

  return new Response(JSON.stringify(stats, null, 2), {
    status: stats.errors.length === 0 ? 200 : 207,
    headers: { "Content-Type": "application/json" },
  });
});
