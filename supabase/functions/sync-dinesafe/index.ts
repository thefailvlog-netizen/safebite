/**
 * SafeBite — DineSafe ETL Sync
 *
 * Fetches restaurant inspection data from the Toronto Open Data (DineSafe) API
 * and upserts it into the Supabase database.
 *
 * Data source: https://open.toronto.ca/dataset/dinesafe/
 * API: Toronto CKAN datastore
 *
 * Expected to run nightly via Supabase scheduled function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const PACKAGE_ID = "dinesafe";
const PAGE_SIZE = 1000;

interface DineSafeRow {
  _id: number;
  "Establishment ID": number;
  "Establishment Name": string;
  "Establishment Type": string;
  "Establishment Address": string;
  Latitude: string | null;
  Longitude: string | null;
  "Inspection ID": number;
  "Inspection Date": string;
  "Inspection Type": string;
  "Establishment Status": string;
  "Min. Inspections Per Year": number;
  "Infraction Details": string | null;
  Severity: string | null;
  Action: string | null;
  "Outcome Type": string | null;
  "Amount Fined": string | null;
  "Court Date": string | null;
}

interface SyncStats {
  establishmentsUpserted: number;
  inspectionsUpserted: number;
  infractionsInserted: number;
  errors: string[];
}

Deno.serve(async (req) => {
  // Allow GET (for testing) and POST (from scheduler)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stats: SyncStats = {
    establishmentsUpserted: 0,
    inspectionsUpserted: 0,
    infractionsInserted: 0,
    errors: [],
  };

  try {
    // Step 1: Get the DineSafe resource ID from the CKAN package
    const packageRes = await fetch(
      `${CKAN_BASE}/package_show?id=${PACKAGE_ID}`
    );
    const packageData = await packageRes.json();

    if (!packageData.success) {
      throw new Error("Failed to fetch DineSafe package metadata");
    }

    // Find the datastore resource (prefer the most recently modified)
    const resources = packageData.result.resources as Array<{
      id: string;
      name: string;
      datastore_active: boolean;
      last_modified: string;
    }>;

    const datastoreResource = resources
      .filter((r) => r.datastore_active)
      .sort(
        (a, b) =>
          new Date(b.last_modified).getTime() -
          new Date(a.last_modified).getTime()
      )[0];

    if (!datastoreResource) {
      throw new Error("No active datastore resource found for DineSafe");
    }

    console.log(`Using resource: ${datastoreResource.id} (${datastoreResource.name})`);

    // Step 2: Paginate through all records
    let offset = 0;
    let totalRecords = Infinity;
    const allRows: DineSafeRow[] = [];

    while (offset < totalRecords) {
      const url = `${CKAN_BASE}/datastore_search?id=${datastoreResource.id}&limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        throw new Error(`Failed to fetch page at offset ${offset}`);
      }

      totalRecords = data.result.total;
      const rows: DineSafeRow[] = data.result.records;
      allRows.push(...rows);
      offset += PAGE_SIZE;

      console.log(`Fetched ${allRows.length}/${totalRecords} records`);

      // Safety valve
      if (allRows.length > 500000) break;
    }

    // Step 3: Group rows by establishment and inspection
    const establishmentMap = new Map<string, DineSafeRow>();
    const inspectionMap = new Map<string, DineSafeRow[]>();

    for (const row of allRows) {
      const estId = String(row["Establishment ID"]);
      const inspId = String(row["Inspection ID"]);

      if (!establishmentMap.has(estId)) {
        establishmentMap.set(estId, row);
      }

      if (!inspectionMap.has(inspId)) {
        inspectionMap.set(inspId, []);
      }
      inspectionMap.get(inspId)!.push(row);
    }

    // Step 4: Upsert establishments
    const establishmentRows = Array.from(establishmentMap.values()).map((row) => {
      const lat = row.Latitude ? parseFloat(row.Latitude) : null;
      const lng = row.Longitude ? parseFloat(row.Longitude) : null;

      return {
        external_id: String(row["Establishment ID"]),
        name: row["Establishment Name"]?.trim() ?? "",
        address: row["Establishment Address"]?.trim() ?? null,
        city: "Toronto",
        province: "ON",
        lat,
        lng,
        category: row["Establishment Type"]?.trim() ?? null,
        status: row["Establishment Status"]?.trim() ?? null,
        source: "dinesafe",
      };
    });

    // Batch upsert in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < establishmentRows.length; i += BATCH_SIZE) {
      const batch = establishmentRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("establishments")
        .upsert(batch, { onConflict: "external_id" });

      if (error) {
        stats.errors.push(`establishments batch ${i}: ${error.message}`);
      } else {
        stats.establishmentsUpserted += batch.length;
      }
    }

    console.log(`Upserted ${stats.establishmentsUpserted} establishments`);

    // Step 5: Fetch establishment UUIDs (external_id → uuid)
    const { data: estRecords, error: estFetchError } = await supabase
      .from("establishments")
      .select("id, external_id");

    if (estFetchError) throw new Error(`Failed to fetch establishment IDs: ${estFetchError.message}`);

    const estIdMap = new Map<string, string>(
      estRecords!.map((r: { id: string; external_id: string }) => [r.external_id, r.id])
    );

    // Step 6: Upsert inspections and insert infractions
    const inspectionInserts = [];
    const infractionInserts = [];

    for (const [inspExternalId, rows] of inspectionMap.entries()) {
      const firstRow = rows[0];
      const estExternalId = String(firstRow["Establishment ID"]);
      const establishmentUuid = estIdMap.get(estExternalId);

      if (!establishmentUuid) continue;

      const parsedDate = firstRow["Inspection Date"]
        ? new Date(firstRow["Inspection Date"]).toISOString().split("T")[0]
        : null;

      if (!parsedDate) continue;

      inspectionInserts.push({
        establishment_id: establishmentUuid,
        external_id: inspExternalId,
        inspection_date: parsedDate,
        inspection_type: firstRow["Inspection Type"]?.trim() ?? null,
        outcome: firstRow["Outcome Type"]?.trim() ?? null,
        source: "dinesafe",
      });

      // Collect infractions for this inspection (rows with actual violation data)
      for (const row of rows) {
        if (row["Infraction Details"]) {
          const courtDate = row["Court Date"]
            ? new Date(row["Court Date"]).toISOString().split("T")[0]
            : null;

          infractionInserts.push({
            _inspection_external_id: inspExternalId,
            external_id: String(row._id),
            infraction_text: row["Infraction Details"]?.trim() ?? null,
            severity: row.Severity?.trim() ?? null,
            action: row.Action?.trim() ?? null,
            amount: row["Amount Fined"] ? parseFloat(row["Amount Fined"]) : null,
            court_date: courtDate,
            source: "dinesafe",
          });
        }
      }
    }

    // Upsert inspections in batches
    for (let i = 0; i < inspectionInserts.length; i += BATCH_SIZE) {
      const batch = inspectionInserts.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("inspections")
        .upsert(batch, { onConflict: "establishment_id,external_id" });

      if (error) {
        stats.errors.push(`inspections batch ${i}: ${error.message}`);
      } else {
        stats.inspectionsUpserted += batch.length;
      }
    }

    console.log(`Upserted ${stats.inspectionsUpserted} inspections`);

    // Fetch inspection UUIDs (external_id → uuid)
    const { data: inspRecords, error: inspFetchError } = await supabase
      .from("inspections")
      .select("id, external_id");

    if (inspFetchError) throw new Error(`Failed to fetch inspection IDs: ${inspFetchError.message}`);

    const inspIdMap = new Map<string, string>(
      inspRecords!.map((r: { id: string; external_id: string }) => [r.external_id, r.id])
    );

    // Insert infractions (skip if already exist via external_id)
    const infractionRows = infractionInserts
      .map(({ _inspection_external_id, ...inf }) => {
        const inspectionUuid = inspIdMap.get(_inspection_external_id);
        if (!inspectionUuid) return null;
        return { ...inf, inspection_id: inspectionUuid };
      })
      .filter(Boolean);

    for (let i = 0; i < infractionRows.length; i += BATCH_SIZE) {
      const batch = infractionRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("infractions")
        .upsert(batch, { onConflict: "inspection_id,external_id", ignoreDuplicates: true });

      if (error) {
        stats.errors.push(`infractions batch ${i}: ${error.message}`);
      } else {
        stats.infractionsInserted += batch.length;
      }
    }

    console.log(`Inserted ${stats.infractionsInserted} infractions`);

    // Step 7: Update PostGIS location column from lat/lng
    await supabase.rpc("update_establishment_locations");

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Fatal: ${message}`);
    console.error("Sync failed:", message);
  }

  return new Response(JSON.stringify(stats, null, 2), {
    status: stats.errors.length === 0 ? 200 : 207,
    headers: { "Content-Type": "application/json" },
  });
});
