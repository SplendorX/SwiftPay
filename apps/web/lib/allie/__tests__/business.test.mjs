/**
 * ALLIE Tier 1 on the Business products — Payroll, and the invoices a
 * business issues. Each table is the many ways owners actually phrase the
 * same task; every one must land on the same action, with no LLM call.
 *
 * Run: pnpm --filter @swiftpay/web test:allie
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyMessage } from "@/lib/allie/classifier";
import { parseAllieAction } from "@/lib/allie/actions";

const action = (message) => classifyMessage(message)?.action ?? null;

/** Every message must match `expected` on the fields it names. */
function expectAll(messages, expected) {
  for (const message of messages) {
    const got = action(message);
    assert.ok(got, `Tier 1 missed: “${message}”`);
    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(got[key], value, `“${message}” → ${key}: ${JSON.stringify(got)}`);
    }
  }
}

function expectEscalate(messages) {
  for (const message of messages) {
    assert.equal(classifyMessage(message), null, `should escalate: “${message}” → ${JSON.stringify(action(message))}`);
  }
}

// ── Payroll ─────────────────────────────────────────────────────────────────

describe("Payroll — starting a run", () => {
  it("reads every way of saying “pay the team”", () => {
    expectAll(
      [
        "run payroll",
        "Run payroll",
        "start a payroll run",
        "start this month's payroll",
        "process payroll",
        "process this month's payroll",
        "kick off payroll",
        "do payroll",
        "execute the payroll",
        "create a new payroll run",
        "new payroll run",
        "pay the team",
        "pay my team",
        "pay our staff",
        "pay all our contractors",
        "pay the employees",
        "pay everyone on payroll",
        "pay salaries",
        "send out salaries",
        "release this month's wages",
        "disburse salaries",
        "can you run payroll please",
        "time to pay the team",
      ],
      { type: "Payroll", action: "run" },
    );
  });

  it("keeps whole-team runs group-free", () => {
    for (const message of ["pay the team", "run payroll for september", "pay our staff", "run payroll for this month"]) {
      assert.equal(action(message)?.group, undefined, message);
    }
  });

  it("reads the group or department being paid", () => {
    for (const [message, group] of [
      ["pay the engineering team", "engineering"],
      ["run payroll for the design team", "design"],
      ["run payroll for engineering", "engineering"],
      ["start payroll for the sales department", "sales"],
      ["pay our marketing team", "marketing"],
    ]) {
      const got = action(message);
      assert.equal(got?.action, "run", message);
      assert.equal(got?.group, group, message);
    }
  });

  it("escalates a run that names amounts (that's a batch)", () => {
    expectEscalate(["pay the team 500 each", "pay the staff $200 bonus"]);
  });
});

describe("Payroll — status questions", () => {
  it("answers when, whether and how much", () => {
    expectAll(
      [
        "payroll status",
        "my payroll",
        "payroll",
        "when is the next payroll",
        "when's payday",
        "when is our next payday",
        "when do employees get paid",
        "when will the staff be paid",
        "did payroll go through",
        "did the payroll run",
        "has this month's payroll completed",
        "did salaries go through",
        "has payroll failed",
        "last payroll",
        "show me the last payroll",
        "upcoming payroll",
        "pending payrolls",
        "payroll history",
        "payroll summary",
        "how much was the last payroll",
        "how much is next payroll",
        "payroll awaiting approval",
        "why did payroll fail",
      ],
      { type: "PayrollStatus" },
    );
  });
});

describe("Payroll — the team", () => {
  it("lists who is on payroll", () => {
    expectAll(
      [
        "who's on payroll",
        "who is on our payroll",
        "payroll team",
        "my team",
        "show my team",
        "list our staff",
        "show me all employees",
        "headcount",
        "how many people are on the team",
        "view team members",
      ],
      { type: "Payroll", action: "team" },
    );
  });

  it("filters to contractors or employees when asked", () => {
    assert.equal(action("list my contractors")?.memberType, "CONTRACTOR");
    assert.equal(action("how many freelancers do we have")?.memberType, "CONTRACTOR");
    assert.equal(action("how many employees do we have")?.memberType, "EMPLOYEE");
    assert.equal(action("show my team")?.memberType, undefined);
  });
});

describe("Payroll — adding someone", () => {
  it("reads name, pay and cadence", () => {
    assert.deepEqual(action("add jane doe to payroll at 3000 usdc monthly"), {
      type: "Payroll",
      action: "add",
      name: "jane doe",
      amountUsdc: 3000,
      frequency: "monthly",
    });
  });

  it("reads a username, a type and a weekly rate", () => {
    assert.deepEqual(action("hire @mike as a contractor for 50 usdc weekly"), {
      type: "Payroll",
      action: "add",
      recipient: "@mike",
      amountUsdc: 50,
      frequency: "weekly",
      memberType: "CONTRACTOR",
    });
  });

  it("reads names set off by commas, and every-two-weeks pay", () => {
    const got = action("onboard a new contractor, Sarah Lee, paid 1500 every two weeks");
    assert.equal(got?.action, "add");
    assert.equal(got?.name, "Sarah Lee");
    assert.equal(got?.amountUsdc, 1500);
    assert.equal(got?.frequency, "biweekly");
    assert.equal(got?.memberType, "CONTRACTOR");
  });

  it("reads roles and “k” amounts", () => {
    const tom = action("add a designer called Tom to the team on 2.5k a month");
    assert.equal(tom?.name, "Tom");
    assert.equal(tom?.role, "designer");
    assert.equal(tom?.amountUsdc, 2500);
    assert.equal(tom?.frequency, "monthly");

    const ada = action("add @ada to payroll as a senior engineer earning 6000 per month");
    assert.equal(ada?.recipient, "@ada");
    assert.equal(ada?.role, "senior engineer");
    assert.equal(ada?.amountUsdc, 6000);
  });

  it("covers the other ways people say it", () => {
    expectAll(
      [
        "put sarah on payroll for 4000 monthly",
        "add a new employee",
        "add someone to payroll",
        "onboard a new hire to payroll",
        "register a new contractor",
        "add team member @kofi",
        "add 0x1111111111111111111111111111111111111111 to payroll at 800 weekly",
      ],
      { type: "Payroll", action: "add" },
    );
  });

  it("pays a yearly salary monthly", () => {
    const got = action("add jane to payroll on a salary of 60k a year");
    assert.equal(got?.amountUsdc, 5000);
    assert.equal(got?.frequency, "monthly");
  });

  it("escalates hourly and daily rates, which depend on hours worked", () => {
    expectEscalate([
      "hire @mike as a contractor at 40 usdc per hour",
      "add a freelancer to payroll at 200 a day",
    ]);
  });

  it("never mistakes a deposit or a group for a hire", () => {
    assert.notEqual(action("add 50 usdc to savings")?.action, "add");
    assert.equal(action("add a payroll group for engineering")?.action, "groups");
  });
});

describe("Payroll — approvals, retries, schedules and groups", () => {
  it("approves the pending run", () => {
    expectAll(
      [
        "approve payroll",
        "approve this month's payroll",
        "approve the pending payroll",
        "sign off on the september payroll",
        "authorize payroll",
        "approve salaries",
      ],
      { type: "Payroll", action: "approve" },
    );
  });

  it("retries failed payouts", () => {
    expectAll(
      [
        "retry failed payroll payments",
        "retry the failed payouts",
        "resend failed salaries",
        "fix the failed payroll",
      ],
      { type: "Payroll", action: "retry" },
    );
  });

  it("opens payroll schedules", () => {
    expectAll(
      [
        "payroll schedule",
        "show payroll schedules",
        "schedule payroll for the 25th",
        "set up a monthly payroll",
        "automate payroll",
        "change the payroll date",
        "pause the payroll schedule",
        "recurring payroll",
      ],
      { type: "Payroll", action: "schedules" },
    );
  });

  it("opens payroll groups", () => {
    expectAll(
      [
        "payroll groups",
        "create a payroll group",
        "make a new group for contractors",
        "add a payroll group for engineering",
      ],
      { type: "Payroll", action: "groups" },
    );
  });
});

// ── Invoices ────────────────────────────────────────────────────────────────

describe("Invoices — creating one", () => {
  it("reads customer, amount, what for, and terms", () => {
    assert.deepEqual(
      action("create an invoice for acme for 500 usdc for logo design due in 14 days"),
      {
        type: "CreateInvoice",
        asset: "USDC",
        customer: "acme",
        amountUsdc: 500,
        description: "logo design",
        dueInDays: 14,
      },
    );
  });

  it("reads a username customer", () => {
    assert.deepEqual(action("invoice @bolt 1200 usdc for march retainer"), {
      type: "CreateInvoice",
      asset: "USDC",
      customer: "@bolt",
      amountUsdc: 1200,
      description: "march retainer",
    });
  });

  it("reads an email customer", () => {
    const got = action("send an invoice of $300 to john@acme.com for consulting");
    assert.equal(got?.type, "CreateInvoice");
    assert.equal(got?.customer, "john@acme.com");
    assert.equal(got?.amountUsdc, 300);
    assert.equal(got?.description, "consulting");
  });

  it("reads multi-word companies, EURC and net terms", () => {
    const got = action("make an invoice to Globex Corporation for 2,500 eurc, net 30");
    assert.equal(got?.customer, "Globex Corporation");
    assert.equal(got?.amountUsdc, 2500);
    assert.equal(got?.asset, "EURC");
    assert.equal(got?.dueInDays, 30);
  });

  it("reads “k” amounts, a named customer after the amount, and next week", () => {
    const got = action("raise an invoice for 5k to Stark Industries for consulting due next week");
    assert.equal(got?.customer, "Stark Industries");
    assert.equal(got?.amountUsdc, 5000);
    assert.equal(got?.description, "consulting");
    assert.equal(got?.dueInDays, 7);
  });

  it("reads the casual phrasings", () => {
    for (const [message, customer, amount] of [
      ["I need to invoice Initech 750 for the website redesign", "Initech", 750],
      ["invoice acme 500", "acme", 500],
      ["bill acme 500 usdc via invoice", "acme", 500],
      ["can you invoice @zed $80", "@zed", 80],
      ["new invoice for Wayne Enterprises, 10000 usdc", "Wayne Enterprises", 10000],
    ]) {
      const got = action(message);
      assert.equal(got?.type, "CreateInvoice", message);
      assert.equal(got?.customer, customer, message);
      assert.equal(got?.amountUsdc, amount, message);
    }
  });

  it("opens a blank invoice when no details are given", () => {
    for (const message of ["create an invoice", "make a new invoice", "draft an invoice", "new invoice"]) {
      assert.deepEqual(action(message), { type: "CreateInvoice", asset: "USDC" }, message);
    }
  });

  it("carries a note, a date and due-on-receipt", () => {
    assert.equal(action("invoice acme 500 for design, note: thanks for your business")?.note, "thanks for your business");
    assert.equal(action("invoice acme 500 due 2026-11-01")?.dueDate, "2026-11-01");
    assert.equal(action("invoice acme 500 due on receipt")?.dueInDays, 0);
    assert.equal(action("invoice acme 500 due in two weeks")?.dueInDays, 14);
  });

  it("escalates a due date or line items it would have to guess", () => {
    expectEscalate([
      "invoice acme 500 due end of the month",
      "invoice acme for 3 hours at 50 usdc",
      "invoice acme 500 due friday",
    ]);
  });
});

describe("Invoices — status", () => {
  it("reads what is owed", () => {
    expectAll(
      [
        "show unpaid invoices",
        "outstanding invoices",
        "which invoices are still open",
        "who owes me money",
        "who hasn't paid",
        "how much are we owed",
        "how much am I owed",
        "accounts receivable",
        "pending invoices",
      ],
      { type: "InvoiceStatus", filter: "open" },
    );
  });

  it("reads overdue, paid and draft", () => {
    expectAll(["any overdue invoices?", "which invoices are late", "past due invoices"], {
      type: "InvoiceStatus",
      filter: "overdue",
    });
    expectAll(["paid invoices", "which invoices have been paid"], {
      type: "InvoiceStatus",
      filter: "paid",
    });
    expectAll(["draft invoices", "show my unsent invoices", "which invoices haven't gone out yet"], {
      type: "InvoiceStatus",
      filter: "draft",
    });
  });

  it("lists everything on a plain ask", () => {
    assert.equal(action("show my invoices")?.type, "InvoiceStatus");
    assert.equal(action("invoice status")?.type, "InvoiceStatus");
    assert.equal(action("list all invoices")?.filter, "all");
  });

  it("reads the customer being asked about", () => {
    assert.deepEqual(action("show invoices for acme"), { type: "InvoiceStatus", customer: "acme" });
    assert.deepEqual(action("unpaid invoices from @bolt"), {
      type: "InvoiceStatus",
      filter: "open",
      customer: "@bolt",
    });
    assert.deepEqual(action("has acme paid their invoice"), {
      type: "InvoiceStatus",
      filter: "all",
      customer: "acme",
    });
  });

  it("reads a question about one invoice as a view", () => {
    assert.deepEqual(action("is INV-0004 paid?"), { type: "InvoiceAction", action: "view", ref: "INV-0004" });
    assert.deepEqual(action("has INV-0020 been paid"), { type: "InvoiceAction", action: "view", ref: "INV-0020" });
    assert.deepEqual(action("did @bolt pay invoice INV-0003"), {
      type: "InvoiceAction",
      action: "view",
      ref: "INV-0003",
    });
  });
});

describe("Invoices — acting on one", () => {
  it("reminds, however it's phrased", () => {
    for (const [message, ref] of [
      ["remind acme about their invoice", "acme"],
      ["chase @bolt for payment on INV-0012", "INV-0012"],
      ["send a reminder for invoice 12", "12"],
      ["nudge Initech about the overdue invoice", "Initech"],
      ["follow up with john on the unpaid invoice", "john"],
      ["send a payment reminder to @zed", "@zed"],
      ["remind acme to pay us", "acme"],
      ["remind them about the last invoice", "last"],
    ]) {
      assert.deepEqual(action(message), { type: "InvoiceAction", action: "remind", ref }, message);
    }
  });

  it("cancels", () => {
    for (const [message, ref] of [
      ["cancel INV-0003", "INV-0003"],
      ["cancel invoice INV-0003", "INV-0003"],
      ["void the last invoice", "last"],
      ["delete my draft invoice", "last"],
      ["cancel invoice #7", "7"],
    ]) {
      assert.deepEqual(action(message), { type: "InvoiceAction", action: "cancel", ref }, message);
    }
  });

  it("sends an existing invoice", () => {
    for (const [message, ref] of [
      ["send invoice INV-0005", "INV-0005"],
      ["send the latest invoice", "last"],
      ["send my draft invoice", "last"],
      ["resend invoice 9", "9"],
      ["send the invoice to acme", "acme"],
      ["email the invoice to @bolt", "@bolt"],
    ]) {
      assert.deepEqual(action(message), { type: "InvoiceAction", action: "send", ref }, message);
    }
  });

  it("opens one", () => {
    for (const [message, ref] of [
      ["show me invoice INV-0007", "INV-0007"],
      ["open the last invoice", "last"],
      ["INV-0007", "INV-0007"],
      ["invoice 12", "12"],
      ["inv 12?", "INV-12"],
    ]) {
      assert.deepEqual(action(message), { type: "InvoiceAction", action: "view", ref }, message);
    }
  });
});

// ── Boundaries: business words must not swallow payments, and vice versa ───

describe("Business vs payments", () => {
  it("keeps paying an invoice you received as PayInvoice", () => {
    assert.equal(action("pay invoice #4821")?.type, "PayInvoice");
    assert.equal(action("pay my last invoice")?.type, "PayInvoice");
    assert.equal(action("pay the invoice from Acme Corp")?.type, "PayInvoice");
  });

  it("keeps a payment that mentions an invoice a payment", () => {
    const got = action("send 500 usdc to @acme for invoice 12");
    assert.equal(got?.type, "PaymentIntent");
    assert.equal(got?.note, "invoice 12");
  });

  it("keeps sends, splits and requests where they were", () => {
    assert.equal(action("send $5 to @alex")?.type, "PaymentIntent");
    assert.equal(action("pay @alex 30")?.type, "PaymentIntent");
    assert.equal(action("split 30 usdc among my team, @a1 and @b2")?.type, "BatchPay");
    assert.equal(action("bill splendor $5")?.type, "RequestPayment");
    assert.equal(action("request 20 usdc from @sam")?.type, "RequestPayment");
    assert.equal(action("send 5 usdc to @ada every month")?.type, "Recurring");
    assert.equal(action("show my recurring payments")?.type, "RecurringStatus");
  });

  it("never pays a person called “team”", () => {
    assert.notEqual(action("pay the team")?.type, "PaymentIntent");
  });
});

// ── The LLM's answers pass the same validation ──────────────────────────────

describe("parseAllieAction — business shapes", () => {
  it("accepts a full add-member action and drops unknown values", () => {
    assert.deepEqual(
      parseAllieAction(
        JSON.stringify({
          type: "Payroll",
          action: "add",
          name: "Jane Doe",
          recipient: "@jane",
          amountUsdc: 3000,
          frequency: "monthly",
          memberType: "INTERN",
          role: "designer",
        }),
      ),
      {
        type: "Payroll",
        action: "add",
        name: "Jane Doe",
        recipient: "@jane",
        amountUsdc: 3000,
        frequency: "monthly",
        role: "designer",
      },
    );
  });

  it("rejects payroll cycles payroll doesn't run", () => {
    const got = parseAllieAction('{"type":"Payroll","action":"add","frequency":"daily"}');
    assert.equal(got?.frequency, undefined);
  });

  it("accepts invoices and drops an impossible due date", () => {
    assert.deepEqual(
      parseAllieAction(
        '{"type":"CreateInvoice","customer":"Acme","amountUsdc":500,"asset":"EURC","dueDate":"2026-02-30","dueInDays":30}',
      ),
      { type: "CreateInvoice", customer: "Acme", amountUsdc: 500, asset: "EURC", dueInDays: 30 },
    );
    assert.deepEqual(parseAllieAction('{"type":"InvoiceStatus","filter":"overdue"}'), {
      type: "InvoiceStatus",
      filter: "overdue",
    });
    assert.deepEqual(parseAllieAction('{"type":"InvoiceAction","action":"remind","ref":"INV-0004"}'), {
      type: "InvoiceAction",
      action: "remind",
      ref: "INV-0004",
    });
  });

  it("rejects an invoice action with no target or an unknown verb", () => {
    assert.equal(parseAllieAction('{"type":"InvoiceAction","action":"remind"}'), null);
    assert.equal(parseAllieAction('{"type":"InvoiceAction","action":"refund","ref":"INV-1"}'), null);
    assert.equal(parseAllieAction('{"type":"Payroll","action":"fire"}'), null);
  });
});
