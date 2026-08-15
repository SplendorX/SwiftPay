/**
 * End-to-end probe: insert a claim notification the way production does
 * after metadata/related_tx_hash columns are stripped.
 */
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

const receiver = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const claimCode =
  "privswiftpay:eyJhbW91bnQiOiIxMCIsImtpbmQiOiJwcml2c3dpZnRwYXkucGF5bWVudCJ9";
const paymentId =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const body = [
  "You received $10 USDC from 0xSender.",
  `PAYMENT_ID:${paymentId}`,
  `CLAIM_CODE:${claimCode}`,
].join("\n");

// Simulate robust insert (full → strip metadata → strip related_tx_hash)
let row = {
  owner_wallet: receiver.toLowerCase(),
  kind: "privswiftpay_claim",
  title: "10 USDC ready to claim",
  body,
  related_tx_hash: paymentId,
  metadata: { claimCode, type: "privswiftpay_claim" },
};

for (let i = 0; i < 4; i++) {
  const res = await sb
    .from("savings_notifications")
    .insert(row)
    .select("*")
    .single();
  if (!res.error) {
    console.log("SUCCESS insert", {
      id: res.data.id,
      kind: res.data.kind,
      owner: res.data.owner_wallet,
      bodyHasCode: res.data.body.includes("CLAIM_CODE:"),
      bodyLen: res.data.body.length,
    });

    // Parse like the bell does
    const match = res.data.body.match(/CLAIM_CODE:(privswiftpay:[A-Za-z0-9_-]+)/i);
    console.log("parsed claim code:", match?.[1] ?? null);

    // list as receiver
    const list = await sb
      .from("savings_notifications")
      .select("*")
      .eq("owner_wallet", receiver.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(5);
    console.log(
      "receiver list count",
      list.data?.length,
      list.data?.map((r) => r.title),
    );

    await sb.from("savings_notifications").delete().eq("id", res.data.id);
    process.exit(0);
  }

  console.log("attempt", i, "error:", res.error.message);
  const miss = res.error.message.match(/'([^']+)' column/i);
  if (miss?.[1] && miss[1] in row) {
    delete row[miss[1]];
    console.log("stripped", miss[1]);
    continue;
  }
  console.error("FATAL", res.error);
  process.exit(1);
}
