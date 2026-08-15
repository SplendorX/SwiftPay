import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, isAddress, parseUnits } from "viem";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env");
const raw = readFileSync(envPath, "utf8");
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const escrow = process.env.NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS;
console.log({
  url: url ? "set" : "missing",
  serviceKey: key ? `set len=${key.length}` : "missing",
  escrow,
});

const supabase = createClient(url, key, { auth: { persistSession: false } });

const probe = await supabase
  .from("savings_notifications")
  .select("id,kind,owner_wallet,title,body,metadata,created_at")
  .order("created_at", { ascending: false })
  .limit(8);
console.log("list error:", probe.error?.message ?? null, probe.error?.code ?? null);
console.log("recent rows:", probe.data?.length ?? 0);
for (const row of probe.data ?? []) {
  console.log({
    id: row.id,
    kind: row.kind,
    owner: row.owner_wallet,
    title: row.title,
    hasClaimCode: Boolean(row.metadata?.claimCode),
    created: row.created_at,
  });
}

const testWallet = "0x1111111111111111111111111111111111111111";
const ts = Date.now();

const ins1 = await supabase
  .from("savings_notifications")
  .insert({
    owner_wallet: testWallet,
    kind: "privswiftpay_claim",
    title: "test claim",
    body: "test body",
    related_tx_hash: `0xtest_priv_claim_${ts}`,
    metadata: { claimCode: "privswiftpay:test", type: "privswiftpay_claim" },
  })
  .select("*")
  .single();
console.log(
  "insert privswiftpay_claim:",
  ins1.error
    ? {
        code: ins1.error.code,
        msg: ins1.error.message,
        details: ins1.error.details,
        hint: ins1.error.hint,
      }
    : { ok: true, id: ins1.data?.id },
);

const ins2 = await supabase
  .from("savings_notifications")
  .insert({
    owner_wallet: testWallet,
    kind: "payment_received",
    title: "test claim fallback",
    body: "test body 2",
    related_tx_hash: `0xtest_pay_recv_${ts}`,
    metadata: {
      claimCode: "privswiftpay:test2",
      type: "privswiftpay_claim",
    },
  })
  .select("*")
  .single();
console.log(
  "insert payment_received:",
  ins2.error
    ? { code: ins2.error.code, msg: ins2.error.message }
    : { ok: true, id: ins2.data?.id },
);

// Check escrow payments mapping
if (escrow && isAddress(escrow)) {
  const client = createPublicClient({
    transport: http(
      process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network",
    ),
  });
  const abi = [
    {
      type: "function",
      name: "PLATFORM_FEE_BASIS_POINTS",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "uint256" }],
    },
    {
      type: "function",
      name: "feeRecipient",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address" }],
    },
  ];
  try {
    const bps = await client.readContract({
      address: escrow,
      abi,
      functionName: "PLATFORM_FEE_BASIS_POINTS",
    });
    const fee = await client.readContract({
      address: escrow,
      abi,
      functionName: "feeRecipient",
    });
    console.log("escrow on-chain ok", { bps: bps.toString(), fee });
  } catch (e) {
    console.log("escrow on-chain fail", e.message);
  }
}

if (ins1.data?.id)
  await supabase.from("savings_notifications").delete().eq("id", ins1.data.id);
if (ins2.data?.id)
  await supabase.from("savings_notifications").delete().eq("id", ins2.data.id);
