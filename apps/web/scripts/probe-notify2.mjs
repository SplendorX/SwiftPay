import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dirname, "../../../.env"), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const ins = await sb
  .from("savings_notifications")
  .insert({
    owner_wallet: "0x1111111111111111111111111111111111111111",
    kind: "payment_received",
    title: "min test",
    body: "body with code privswiftpay:ABCDEF",
  })
  .select("*")
  .single();
console.log("minimal insert:", ins.error || { ok: true, cols: Object.keys(ins.data) });
if (ins.data?.id) {
  await sb.from("savings_notifications").delete().eq("id", ins.data.id);
}

// related_tx_hash only
const ins3 = await sb
  .from("savings_notifications")
  .insert({
    owner_wallet: "0x1111111111111111111111111111111111111111",
    kind: "payment_received",
    title: "tx hash test",
    body: "b",
    related_tx_hash: "0xabc",
  })
  .select("id")
  .single();
console.log(
  "related_tx_hash insert:",
  ins3.error ? ins3.error.message : "ok",
);
if (ins3.data?.id) {
  await sb.from("savings_notifications").delete().eq("id", ins3.data.id);
}

const kinds = [
  "manual_save_success",
  "payment_received",
  "privswiftpay_claim",
  "reconciliation_alert",
  "spend_save_success",
];
for (const kind of kinds) {
  const r = await sb
    .from("savings_notifications")
    .insert({
      owner_wallet: "0x1111111111111111111111111111111111111111",
      kind,
      title: "k",
      body: "b",
    })
    .select("id,kind")
    .single();
  console.log(kind, r.error ? r.error.message : "ok");
  if (r.data?.id) {
    await sb.from("savings_notifications").delete().eq("id", r.data.id);
  }
}
