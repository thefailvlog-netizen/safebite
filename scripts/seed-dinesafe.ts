/**
 * SafeBite — DineSafe Initial Seed Script
 *
 * Run this locally to do a full historical seed from the Toronto DineSafe API.
 * The Edge Function (sync-dinesafe) is designed for nightly incremental updates
 * and will timeout on a full seed. This script has no timeout limit.
 *
 * Usage:
 *   npx tsx scripts/seed-dinesafe.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ── Load env vars from .env.local ─────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌  .env.local not found. Run from the project root.");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.startsWith("get-from")) {
  console.error(
    "❌  SUPABASE_SERVICE_ROLE_KEY is not set in .env.local\n" +
    "   Get it from: Supabase Dashboard → Project Settings → API → service_role"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const PAGE_SIZE = 1000;
const BATCH = 500;

// ── Null-safety helpers ────────────────────────────────────────────────────

function isNullLike(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return s === "" || s === "None" || s === "null" || s === "undefined";
}

function ns(val: unknown): string | null {
  return isNullLike(val) ? null : String(val).trim();
}

function nf(val: unknown): number | null {
  if (isNullLike(val)) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function nd(val: unknown): string | null {
  if (isNullLike(val)) return null;
  try {
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/**
 * Derive Pass / Conditional Pass from DineSafe infraction data.
 *
 * The current DineSafe dataset does not include an explicit "Establishment Status"
 * field (Pass / Conditional Pass / Closed). We derive it from infractions:
 *   - No infractions present           → "Pass"
 *   - Any infraction present           → "Conditional Pass"
 *
 * DineSafe severity codes: M = Minor, S = Significant, C = Crucial
 */
function deriveOutcome(rows: Record<string, unknown>[]): string {
  const hasInfraction = rows.some((r) => !isNullLike(r["Infraction Details"]));
  if (!hasInfraction) return "Pass";
  return "Conditional Pass";
}

// ── Fetch all establishments from Supabase with pagination ─────────────────
async function fetchAllEstablishments(): Promise<{ id: string; external_id: string }[]> {
  const all: { id: string; external_id: string }[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("establishments")
      .select("id, external_id")
      .range(from, from + batchSize - 1);

    if (error) throw new Error(`Failed to fetch establishments: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍽️  SafeBite — DineSafe Seed");
  console.log(`📡  Supabase: ${SUPABASE_URL}\n`);

  // Discover resource
  const pkgRes = await fetch(`${CKAN_BASE}/package_show?id=dinesafe`);
  const pkgData = await pkgRes.json();
  if (!pkgData.success) throw new Error("Failed to fetch DineSafe package");

  const resource = pkgData.result.resources
    .filter((r: { datastore_active: boolean }) => r.datastore_active)
    .sort(
      (a: { last_modified: string }, b: { last_modified: string }) =>
        new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime()
    )[0];

  if (!resource) throw new Error("No active DineSafe resource found");
  console.log(`📦  Resource: ${resource.id} — ${resource.name}`);

  // ── Fetch all rows from DineSafe API ──────────────────────────────────────
  let offset = 0;
  let total = Infinity;
  const allRows: Record<string, unknown>[] = [];

  while (offset < total) {
    const res = await fetch(
      `${CKAN_BASE}/datastore_search?id=${resource.id}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    const data = await res.json();
    if (!data.success) throw new Error(`Fetch failed at offset ${offset}`);
    total = data.result.total;
    allRows.push(...data.result.records);
    offset += PAGE_SIZE;
    process.stdout.write(`\r⬇️   Fetched ${allRows.length.toLocaleString()} / ${total.toLocaleString()} rows`);
  }
  console.log(`\n✅  Fetched ${allRows.length.toLocaleString()} total rows`);

  // ── Group rows by establishment and inspection ─────────────────────────────
  //
  // DineSafe data model (current API):
  //   - One row per infraction (or one row per clean inspection with no infraction)
  //   - "Inspection ID" is usually "None" — we synthesize a key from (EstID + Date)
  //   - No "Inspection Type" field exists in the current API
  //
  const estMap = new Map<string, Record<string, unknown>>();   // extId → first row
  const inspMap = new Map<string, Record<string, unknown>[]>(); // inspKey → all rows

  for (const row of allRows) {
    const estId = isNullLike(row["Establishment ID"]) ? null : String(row["Establishment ID"]);
    if (!estId) continue;

    if (!estMap.has(estId)) estMap.set(estId, row);

    const rawInspId = row["Inspection ID"];
    const date = nd(row["Inspection Date"]) ?? "nodate";

    // Synthetic key: EstID + Date (no Inspection Type in current DineSafe API)
    const inspKey = isNullLike(rawInspId)
      ? `synth_${estId}_${date}`
      : String(rawInspId);

    if (!inspMap.has(inspKey)) inspMap.set(inspKey, []);
    inspMap.get(inspKey)!.push(row);
  }

  console.log(`\n🏪  Unique establishments: ${estMap.size.toLocaleString()}`);
  console.log(`🔍  Unique inspections:    ${inspMap.size.toLocaleString()}`);

  // ── Upsert establishments ─────────────────────────────────────────────────
  console.log("\n📥  Upserting establishments...");
  const estRows = Array.from(estMap.values()).map((row) => ({
    external_id: String(row["Establishment ID"]),
    name: ns(row["Establishment Name"]) ?? "",
    address: ns(row["Establishment Address"]),
    city: "Toronto",
    province: "ON",
    lat: nf(row["Latitude"]),
    lng: nf(row["Longitude"]),
    category: ns(row["Establishment Type"]),
    status: null,   // DineSafe no longer includes Establishment Status as a field
    source: "dinesafe",
  }));

  let estCount = 0;
  let estErrors = 0;
  for (let i = 0; i < estRows.length; i += BATCH) {
    const { error } = await supabase
      .from("establishments")
      .upsert(estRows.slice(i, i + BATCH), { onConflict: "external_id" });
    if (error) {
      console.error(`\n  ⚠️  est batch ${i}: ${error.message}`);
      estErrors++;
    } else {
      estCount += Math.min(BATCH, estRows.length - i);
    }
    process.stdout.write(`\r  ✅  ${estCount.toLocaleString()} / ${estRows.length.toLocaleString()} (${estErrors} errors)`);
  }
  console.log();

  // ── Load full establishment UUID map (paginated) ──────────────────────────
  console.log("\n🗺️   Loading establishment ID map...");
  const estRecs = await fetchAllEstablishments();
  const estIdMap = new Map(estRecs.map((r) => [r.external_id, r.id]));
  console.log(`   Loaded ${estIdMap.size.toLocaleString()} establishment IDs`);

  // ── Build inspection + infraction rows ────────────────────────────────────
  const inspRows: object[] = [];
  const infrQueue: Array<{ key: string; row: Record<string, unknown> }> = [];
  let skippedNoEst = 0;
  let skippedNoDate = 0;

  for (const [key, rows] of inspMap.entries()) {
    const first = rows[0];
    const estUuid = estIdMap.get(String(first["Establishment ID"]));
    if (!estUuid) { skippedNoEst++; continue; }

    const date = nd(first["Inspection Date"]);
    if (!date) { skippedNoDate++; continue; }

    // Derive outcome from infraction data (DineSafe removed explicit Pass/Fail field)
    const outcome = deriveOutcome(rows);

    inspRows.push({
      establishment_id: estUuid,
      external_id: key,
      inspection_date: date,
      inspection_type: null,   // Not in current DineSafe API
      outcome,
      source: "dinesafe",
    });

    for (const row of rows) {
      if (!isNullLike(row["Infraction Details"])) {
        infrQueue.push({ key, row });
      }
    }
  }

  console.log(`\n   Skipped (no est match): ${skippedNoEst}`);
  console.log(`   Skipped (no date):       ${skippedNoDate}`);
  console.log(`   Inspections to insert:   ${inspRows.length.toLocaleString()}`);

  // ── Upsert inspections ────────────────────────────────────────────────────
  console.log("\n🔍  Upserting inspections...");
  let inspCount = 0;
  let inspErrors = 0;
  for (let i = 0; i < inspRows.length; i += BATCH) {
    const { error } = await supabase
      .from("inspections")
      .upsert(inspRows.slice(i, i + BATCH), {
        onConflict: "establishment_id,external_id",
      });
    if (error) {
      console.error(`\n  ⚠️  insp batch ${i}: ${error.message}`);
      inspErrors++;
    } else {
      inspCount += Math.min(BATCH, inspRows.length - i);
    }
    process.stdout.write(`\r  ✅  ${inspCount.toLocaleString()} / ${inspRows.length.toLocaleString()} (${inspErrors} errors)`);
  }
  console.log();

  // ── Load inspection UUID map (paginated) ──────────────────────────────────
  console.log("\n🗺️   Loading inspection ID map...");
  let allInspRecs: { id: string; external_id: string }[] = [];
  let inspPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, external_id")
      .range(inspPage * 1000, (inspPage + 1) * 1000 - 1);
    if (error) throw new Error(`Failed to fetch inspections: ${error.message}`);
    if (!data || data.length === 0) break;
    allInspRecs.push(...data);
    if (data.length < 1000) break;
    inspPage++;
  }
  const inspIdMap = new Map(allInspRecs.map((r) => [r.external_id, r.id]));
  console.log(`   Loaded ${inspIdMap.size.toLocaleString()} inspection IDs`);

  // ── Upsert infractions ────────────────────────────────────────────────────
  console.log("\n⚠️   Upserting infractions...");
  const infrRows = infrQueue
    .map(({ key, row }) => {
      const inspUuid = inspIdMap.get(key);
      if (!inspUuid) return null;
      return {
        inspection_id: inspUuid,
        external_id: String(row._id),
        infraction_text: ns(row["Infraction Details"]),
        severity: ns(row["Severity"]),
        action: ns(row["Action"]),
        amount: nf(row["Amount Fined"]),
        source: "dinesafe",
      };
    })
    .filter(Boolean);

  let infrCount = 0;
  let infrErrors = 0;
  for (let i = 0; i < infrRows.length; i += BATCH) {
    const { error } = await supabase
      .from("infractions")
      .upsert(infrRows.slice(i, i + BATCH), {
        onConflict: "inspection_id,external_id",
        ignoreDuplicates: true,
      });
    if (error) {
      console.error(`\n  ⚠️  infr batch ${i}: ${error.message}`);
      infrErrors++;
    } else {
      infrCount += Math.min(BATCH, infrRows.length - i);
    }
    process.stdout.write(`\r  ✅  ${infrCount.toLocaleString()} / ${infrRows.length.toLocaleString()} (${infrErrors} errors)`);
  }
  console.log();

  // ── Update PostGIS locations ───────────────────────────────────────────────
  console.log("\n🗺️   Updating PostGIS locations...");
  const { error: rpcError } = await supabase.rpc("update_establishment_locations");
  if (rpcError) console.warn(`  ⚠️  PostGIS update skipped: ${rpcError.message}`);
  else console.log("  ✅  PostGIS locations updated");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n🎉  Seed complete!");
  console.log(`   Establishments: ${estCount.toLocaleString()} (${estErrors} batch errors)`);
  console.log(`   Inspections:    ${inspCount.toLocaleString()} (${inspErrors} batch errors)`);
  console.log(`   Infractions:    ${infrCount.toLocaleString()} (${infrErrors} batch errors)`);
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  process.exit(1);
});
