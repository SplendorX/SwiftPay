/**
 * Live eval: ALLIE's language tier on Business payroll and invoice requests —
 * the phrasings Tier 1 hands up (messy, compound, indirect). Calls the real
 * model, so it costs a little and is NOT part of `pnpm test`.
 *
 * Run from apps/web:
 *   node --env-file=../../.env --experimental-strip-types \
 *     --import ./lib/payment-engine/__tests__/register.mjs \
 *     lib/allie/__tests__/llm-business-eval.mjs [--tier=3] [--only=payroll|invoice]
 */
import { classifyMessage } from "@/lib/allie/classifier";
import { extractPaymentAction } from "@/lib/allie/llm";

const tier = process.argv.includes("--tier=3") ? 3 : 2;
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);

const context = {
  walletBalance: 250_000_000n,
  dailySpentUnits: 0n,
  dailyLimitUnits: 1_000_000_000n,
  approvedRecipients: ["@bolt", "@acme"],
  recentTransactions: [],
  agentWalletStatus: "active",
  timeZone: "Africa/Lagos",
  localNow: "2026-09-25T10:00+01:00",
  contactNames: ["Mum", "Tunde"],
};

const is = (fields) => (action) =>
  Object.entries(fields).every(([key, value]) =>
    typeof value === "function" ? value(action[key]) : action[key] === value,
  );
const near = (target) => (value) => typeof value === "number" && Math.abs(value - target) < 0.01;
const has = (fragment) => (value) =>
  typeof value === "string" && value.toLowerCase().includes(fragment.toLowerCase());
const absent = (value) => value === undefined;

const cases = [
  // ── Payroll ────────────────────────────────────────────────────────────
  ["payroll", "it's the 25th, can we get everyone paid today", is({ type: "Payroll", action: "run" })],
  ["payroll", "salaries need to go out before the weekend", is({ type: "Payroll", action: "run" })],
  ["payroll", "pay the dev team their wages for this month", is({ type: "Payroll", action: "run", group: has("dev") })],
  ["payroll", "process october salaries for the support crew", is({ type: "Payroll", action: "run", group: has("support") })],
  ["payroll", "i want to pay my staff", is({ type: "Payroll", action: "run" })],
  ["payroll", "have my people been paid yet this month?", is({ type: "PayrollStatus" })],
  ["payroll", "what's the total we spend on salaries each month", (a) => a.type === "PayrollStatus" || (a.type === "Payroll" && a.action === "team")],
  ["payroll", "is there anything I need to sign off for payroll", (a) => a.type === "PayrollStatus" || (a.type === "Payroll" && a.action === "approve")],
  ["payroll", "go ahead and approve september's payroll run", is({ type: "Payroll", action: "approve" })],
  ["payroll", "a couple of salary payments bounced, try them again", is({ type: "Payroll", action: "retry" })],
  ["payroll", "how many contractors are we paying right now", is({ type: "Payroll", action: "team", memberType: "CONTRACTOR" })],
  ["payroll", "give me a rundown of everyone on the payroll", is({ type: "Payroll", action: "team" })],
  ["payroll", "we just hired Amaka Obi as a product designer, 4,500 usdc a month, her username is @amaka", is({
    type: "Payroll", action: "add", name: has("amaka"), recipient: has("amaka"), amountUsdc: near(4500), frequency: "monthly",
  })],
  ["payroll", "bring on a freelance copywriter, Leo, at 300 bucks every week", is({
    type: "Payroll", action: "add", memberType: "CONTRACTOR", amountUsdc: near(300), frequency: "weekly",
  })],
  ["payroll", "put Chidi on payroll, salary is 5k monthly, pay him to 0x1111111111111111111111111111111111111111", is({
    type: "Payroll", action: "add", name: has("chidi"), amountUsdc: near(5000), frequency: "monthly",
    recipient: "0x1111111111111111111111111111111111111111",
  })],
  ["payroll", "I'd like payroll to run automatically on the last friday of each month", is({ type: "Payroll", action: "schedules" })],
  ["payroll", "split my team into departments for payroll", is({ type: "Payroll", action: "groups" })],
  ["payroll", "when's the next time the team gets paid", is({ type: "PayrollStatus" })],
  // ── Invoices ───────────────────────────────────────────────────────────
  ["invoice", "bill Acme Ltd 2,400 usdc for the Q3 audit, they have 30 days to pay", is({
    type: "CreateInvoice", customer: has("acme"), amountUsdc: near(2400), description: has("audit"), dueInDays: 30,
  })],
  ["invoice", "can you put together an invoice for @bolt — 12 hours of consulting, 1,800 total, due next friday", is({
    type: "CreateInvoice", customer: "@bolt", amountUsdc: near(1800),
    // Today is Friday Sep 25: next Friday is Oct 2, either way it's written.
    dueDate: (value) => value === "2026-10-02" || value === undefined,
    dueInDays: (value) => value === 7 || value === undefined,
  })],
  ["invoice", "I finished the logo for Sunrise Bakery, charge them 350 euros", is({
    type: "CreateInvoice", customer: has("sunrise"), amountUsdc: near(350), asset: "EURC",
  })],
  ["invoice", "send finance@globex.com an invoice for the September retainer, $5000", is({
    type: "CreateInvoice", customer: "finance@globex.com", amountUsdc: near(5000),
  })],
  ["invoice", "invoice my client for the website, 900", is({ type: "CreateInvoice", amountUsdc: near(900) })],
  ["invoice", "which of my clients are late paying", is({ type: "InvoiceStatus", filter: "overdue" })],
  ["invoice", "how much money is still out there that customers owe us", is({ type: "InvoiceStatus", filter: "open" })],
  ["invoice", "did Initech ever settle up?", is({ type: "InvoiceStatus", customer: has("initech") })],
  ["invoice", "what did we collect from invoices", is({ type: "InvoiceStatus", filter: "paid" })],
  ["invoice", "Globex is 2 weeks late, give them a nudge", is({ type: "InvoiceAction", action: "remind", ref: has("globex") })],
  ["invoice", "shoot a reminder over for INV-0042", is({ type: "InvoiceAction", action: "remind", ref: has("0042") })],
  ["invoice", "that last invoice was a mistake, kill it", is({ type: "InvoiceAction", action: "cancel", ref: has("last") })],
  ["invoice", "go ahead and send out the draft invoice for @bolt", is({ type: "InvoiceAction", action: "send", ref: has("bolt") })],
  ["invoice", "pull up invoice 17", is({ type: "InvoiceAction", action: "view", ref: has("17") })],
  ["invoice", "pay the invoice Tunde sent me", is({ type: "PayInvoice" })],
  ["invoice", "I need to get paid by Wayne Enterprises for the security audit — 7,500 usdc, net 15", is({
    type: "CreateInvoice", customer: has("wayne"), amountUsdc: near(7500), dueInDays: 15,
  })],
  ["invoice", "raise a bill for Stark Industries: 3 days of consulting at 800 a day", is({
    type: "CreateInvoice", customer: has("stark"), amountUsdc: near(2400),
  })],
  ["invoice", "please draw up an invoice to @kofi for 150 eurc for the photoshoot, payable by october 10", is({
    type: "CreateInvoice", customer: "@kofi", amountUsdc: near(150), asset: "EURC", dueDate: "2026-10-10",
  })],
  ["invoice", "total up what's overdue", is({ type: "InvoiceStatus", filter: "overdue" })],
  ["invoice", "anyone who hasn't paid their bill yet?", is({ type: "InvoiceStatus", filter: "open" })],
  ["invoice", "show me everything I've billed @bolt", is({ type: "InvoiceStatus", customer: has("bolt") })],
  ["invoice", "which invoices haven't gone out yet", is({ type: "InvoiceStatus", filter: "draft" })],
  ["invoice", "send a polite follow-up to everyone with an unpaid invoice", (a) =>
    (a.type === "InvoiceAction" && a.action === "remind") || (a.type === "InvoiceStatus" && a.filter !== "paid")],
  ["invoice", "void INV-0031, the client cancelled the project", is({ type: "InvoiceAction", action: "cancel", ref: has("0031") })],
  ["invoice", "has INV-0020 been paid", is({ type: "InvoiceAction", action: "view", ref: has("0020") })],
  ["payroll", "cut this month's paychecks", is({ type: "Payroll", action: "run" })],
  ["payroll", "payday! pay the marketing folks", is({ type: "Payroll", action: "run", group: has("marketing") })],
  ["payroll", "did everyone receive their salary last month?", is({ type: "PayrollStatus" })],
  ["payroll", "how much did payroll cost us last month", is({ type: "PayrollStatus" })],
  ["payroll", "the september run is ready, sign it off", is({ type: "Payroll", action: "approve" })],
  ["payroll", "onboard our new intern Sade, 400 usdc every two weeks, @sade", is({
    type: "Payroll", action: "add", recipient: has("sade"), amountUsdc: near(400), frequency: "biweekly",
  })],
  ["payroll", "hire a contractor at 30k a year", (a) => a.type === "Payroll" && a.action === "add" && a.memberType === "CONTRACTOR"],
  ["payroll", "list the employees in the engineering department", is({ type: "Payroll", action: "team" })],
  ["payroll", "move payday to the 28th", is({ type: "Payroll", action: "schedules" })],
  // ── Boundaries ─────────────────────────────────────────────────────────
  ["payroll", "send my mum 50 usdc", is({ type: "PaymentIntent", amountUsdc: near(50) })],
  ["invoice", "what's my balance", is({ type: "QueryBalance" })],
  ["payroll", "pay Tunde 200 for the design work", is({ type: "PaymentIntent", amountUsdc: near(200) })],
  ["payroll", "pay the team 100 each: @a1, @b2 and @c3", (a) => a.type === "BatchPay" && a.legs?.length === 3],
  ["invoice", "request 50 usdc from @sam for dinner", is({ type: "RequestPayment", amountUsdc: near(50) })],
  ["invoice", "send 500 usdc to @acme to pay their invoice 12", is({ type: "PaymentIntent", recipient: has("acme"), amountUsdc: near(500) })],
];

let passed = 0;
let tierOne = 0;
const failures = [];
const selected = cases.filter(([area]) => !only || area === only);

for (const [area, message, check] of selected) {
  // Tier 1 first, exactly as the chat route does it.
  const rule = classifyMessage(message);
  let action;
  let source;
  if (rule) {
    action = rule.action;
    source = "T1";
    tierOne += 1;
  } else {
    const result = await extractPaymentAction(message, context, tier);
    action = result.action;
    source = `T${tier}`;
  }
  const ok = check(action);
  if (ok) passed += 1;
  else failures.push({ area, message, action, source });
  console.log(`${ok ? "PASS" : "FAIL"} [${source}] ${message}\n       → ${JSON.stringify(action)}`);
}

console.log(`\n${passed}/${selected.length} passed · ${tierOne} answered by Tier 1, ${selected.length - tierOne} by Tier ${tier}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const failure of failures) {
    console.log(`- [${failure.source}] ${failure.message}\n    ${JSON.stringify(failure.action)}`);
  }
  process.exitCode = 1;
}
