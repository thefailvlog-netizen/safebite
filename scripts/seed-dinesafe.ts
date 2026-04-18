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
 *
 * Get your service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role secret
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
      (
        a: { last_modified: string },
        b: { last_modified: string }
      ) =>
        new Date(b.last_modified).getTime() -
        new Date(a.last_modified).getTime()
    )[0];

  if (!resource) throw new Error("No active DineSafe resource found");
  console.log(`📦  Resource: ${resource.id} — ${resource.name}`);

  // Paginate
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
    process.stdout.write(`\r⬇️   Fetched ${allRows.length.toLocaleString()}/${total.toLocaleString()} rows`);
  }
  console.log(`\n✅  Fetched ${allRows.length.toLocaleString()} total rows`);

  // Group
  const estMap = new Map<string, Record<string, unknown>>();
  const inspMap = new Map<string, Record<string, unknown>[]>();

  for (const row of allRows) {
    const estId = isNullLike(row["Establishment ID"]) ? null : String(row["Establishment ID"]);
    if (!estId) continue;

    if (!estMap.has(estId)) estMap.set(estId, row);

    const rawInspId = row["Inspection ID"];
    const inspKey = isNullLike(rawInspId)
      ? `synth_${estId}_${nd(row["Inspection Date"]) ?? "nodate"}_${ns(row["Inspection Type"]) ?? "notype"}`
      : String(rawInspId);

    if (!inspMap.has(inspKey)) inspMap.set(inspKey, []);
    inspMap.get(inspKey)!.push(row);
  }

  console.log(`\n🏪  Unique establishments: ${estMap.size.toLocaleString()}`);
  console.log(`🔍  Unique inspections:    ${inspMap.size.toLocaleString()}`);

  // Upsert establishments
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
    status: ns(row["Establishment Status"]),
    source: "dinesafe",
  }));

  let estCount = 0;
  for (let i = 0; i < estRows.length; i += BATCH) {
    const { error } = await supabase
      .from("establishments")
      .upsert(estRows.slice(i, i + BATCH), { onConflict: "external_id" });
    if (error) console.error(`  ⚠️  est batch ${i}: ${error.message}`);
    else estCount += Math.min(BATCH, estRows.length - i);
    process.stdout.write(`\r  ✅  ${estCount.toLocaleString()}/${estRows.length.toLocaleString()}`);
  }
  console.log();

  // Load establishment UUID map
  const { data: estRecs } = await supabase.from("establishments").select("id, external_id");
  const estIdMap = new Map(
    (estRecs ?? []).map((r: { id: string; external_id: string }) => [r.external_id, r.id])
  );

  // Build inspection + infraction rows
  const inspRows = [];
  const infrQueue: Array<{ key: string; row: Record<string, unknown> }> = [];

  for (const [key, rows] of inspMap.entries()) {
    const first = rows[0];
    const estUuid = estIdMap.get(String(first["Establishment ID"]));
    if (!estUuid) continue;
    const date = nd(first["Inspection Date"]);
    if (!date) continue;

    inspRows.push({
      establishment_id: estUuid,
      external_id: key,
      inspection_date: date,
      inspection_type: ns(first["Inspection Type"]),
      outcome: ns(first["Outcome Type"]),
      source: "dinesafe",
    });

    for (const row of rows) {
      if (!isNullLike(row["Infraction Details"])) {
        infrQueue.push({ key, row });
      }
    }
  }

  // Upsert inspections
  console.log("\n🔍  Upserting inspections...");
  let inspCount = 0;
  for (let i = 0; i < inspRows.length; i += BATCH) {
    const { error } = await supabase
      .from("inspections")
      .upsert(inspRows.slice(i, i + BATCH), {
        onConflict: "establishment_id,external_id",
      });
    if (error) console.error(`  ⚠️  insp batch ${i}: ${error.message}`);
    else inspCount += Math.min(BATCH, inspRows.length - i);
    process.stdout.write(`\r  ✅  ${inspCount.toLocaleString()}/${inspRows.length.toLocaleString()}`);
  }
  console.log();

  // Load inspection UUID map
  const { data: inspRecs } = await supabase.from("inspections").select("id, external_id");
  const inspIdMap = new Map(
    (inspRecs ?? []).map((r: { id: string; external_id: string }) => [r.external_id, r.id])
  );

  // Upsert infractions
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
        court_date: nd(row["Court Date"]),
        source: "dinesafe",
      };
    })
    .filter(Boolean);

  let infrCount = 0;
  for (let i = 0; i < infrRows.length; i += BATCH) {
    const { error } = await supabase
      .from("infractions")
      .upsert(infrRows.slice(i, i + BATCH), {
        onConflict: "inspection_id,external_id",
        ignoreDuplicates: true,
      });
    if (error) console.error(`  ⚠️  infr batch ${i}: ${error.message}`);
    else infrCount += Math.min(BATCH, infrRows.length - i);
    process.stdout.write(`\r  ✅  ${infrCount.toLocaleString()}/${infrRows.length.toLocaleString()}`);
  }
  console.log();

  // Update PostGIS locations
  console.log("\n🗺️   Updating PostGIS locations...");
  await supabase.rpc("update_establishment_locations");

  console.log("\n🎉  Seed complete!");
  console.log(`   Establishments: ${estCount.toLocaleString()}`);
  console.log(`   Inspections:    ${inspCount.toLocaleString()}`);
  console.log(`   Infractions:    ${infrCount.toLocaleString()}`);
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  process.exit(1);
});
