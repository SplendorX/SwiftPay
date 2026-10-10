/**
 * ALLIE Tier 1 classifier tests — zero LLM calls by construction.
 *
 * Run: pnpm --filter @saphra/web test:allie
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyMessage } from "@/lib/allie/classifier";
import { parseAllieAction } from "@/lib/allie/actions";

const address = "0xABCabcABCabcABCabcABCabcABCabcABCabcABCa";

describe("Tier 1 — payment intents", () => {
  it("classifies “send $20 to 0xABC…” without an LLM call", () => {
    const result = classifyMessage(`send $20 to ${address}`);

    assert.ok(result);
    assert.equal(result.tier, 1);
    assert.equal(result.confidence, 1);
    assert.deepEqual(result.action, {
      type: "PaymentIntent",
      recipient: address,
      amountUsdc: 20,
      asset: "USDC",
    });
  });

  it("handles the reversed phrasing and decimal amounts", () => {
    const result = classifyMessage("pay @alex 12.50 usdc");

    assert.deepEqual(result?.action, {
      type: "PaymentIntent",
      recipient: "@alex",
      amountUsdc: 12.5,
      asset: "USDC",
    });
  });

  it("reads EURC and thousands separators", () => {
    const result = classifyMessage("transfer 1,250 EURC to @treasury");

    assert.deepEqual(result?.action, {
      type: "PaymentIntent",
      recipient: "@treasury",
      amountUsdc: 1250,
      asset: "EURC",
    });
  });

  it("normalizes bare usernames to @handles", () => {
    assert.equal(classifyMessage("send 5 to alex")?.action.recipient, "alex");
  });

  it("escalates when the recipient is a stop word", () => {
    assert.equal(classifyMessage("send $20 to me"), null);
    assert.equal(classifyMessage("pay someone $5"), null);
  });

  it("escalates on a zero or missing amount", () => {
    assert.equal(classifyMessage("send $0 to @alex"), null);
    assert.equal(classifyMessage("send some money to @alex"), null);
  });
});

describe("Tier 1 — queries and controls", () => {
  it("classifies balance questions", () => {
    for (const message of [
      "what's my balance",
      "show balance",
      "how much do I have",
      "check my balance",
    ]) {
      assert.deepEqual(
        classifyMessage(message)?.action,
        { type: "QueryBalance" },
        message,
      );
    }
  });

  it("classifies transaction history questions", () => {
    for (const message of [
      "show my transactions",
      "recent payments",
      "payment history",
    ]) {
      assert.deepEqual(
        classifyMessage(message)?.action,
        { type: "ListTransactions" },
        message,
      );
    }
  });

  it("classifies agent pause and resume", () => {
    assert.deepEqual(classifyMessage("pause my agent wallet")?.action, {
      type: "AgentControl",
      action: "pause",
    });
    assert.deepEqual(classifyMessage("pause ALLIE")?.action, {
      type: "AgentControl",
      action: "pause",
    });
    assert.deepEqual(classifyMessage("resume my agent wallet")?.action, {
      type: "AgentControl",
      action: "resume",
    });
    assert.deepEqual(classifyMessage("unpause ALLIE")?.action, {
      type: "AgentControl",
      action: "resume",
    });
  });

  it("never classifies revoke at Tier 1", () => {
    assert.equal(classifyMessage("revoke my agent wallet"), null);
  });

  it("classifies invoice payments ahead of generic sends", () => {
    assert.deepEqual(classifyMessage("pay invoice #4821")?.action, {
      type: "PayInvoice",
      ref: "4821",
    });
    assert.deepEqual(classifyMessage("pay my last invoice")?.action, {
      type: "PayInvoice",
      ref: "last",
    });
    assert.deepEqual(
      classifyMessage("pay the invoice from Acme Corp")?.action,
      { type: "PayInvoice", ref: "Acme Corp" },
    );
  });

  it("escalates free-form instructions to Tier 2", () => {
    assert.equal(
      classifyMessage(
        "split next month's rent between my flatmates however seems fair",
      ),
      null,
    );
    assert.equal(classifyMessage(""), null);
  });
});

describe("parseAllieAction", () => {
  it("accepts a well-formed payment intent", () => {
    assert.deepEqual(
      parseAllieAction(
        '{"type":"PaymentIntent","recipient":"@alex","amountUsdc":5,"asset":"USDC"}',
      ),
      {
        type: "PaymentIntent",
        recipient: "@alex",
        amountUsdc: 5,
        asset: "USDC",
        note: undefined,
      },
    );
  });

  it("strips code fences the model sometimes adds", () => {
    assert.deepEqual(parseAllieAction('```json\n{"type":"QueryBalance"}\n```'), {
      type: "QueryBalance",
    });
  });

  it("rejects malformed JSON, unknown types, and bad amounts", () => {
    assert.equal(parseAllieAction("not json"), null);
    assert.equal(parseAllieAction('{"type":"DrainWallet"}'), null);
    assert.equal(
      parseAllieAction(
        '{"type":"PaymentIntent","recipient":"@alex","amountUsdc":0,"asset":"USDC"}',
      ),
      null,
    );
    assert.equal(
      parseAllieAction('{"type":"AgentControl","action":"selfdestruct"}'),
      null,
    );
  });

  it("falls back to the default question on an empty Clarify", () => {
    const action = parseAllieAction('{"type":"Clarify","question":""}');
    assert.equal(action?.type, "Clarify");
    assert.ok(action.question.length > 0);
  });
});

describe("Tier 1 — recurring schedules", () => {
  it("reads “for 5 days” as five daily payments", () => {
    const result = classifyMessage(
      "set up a rcurring payment of 2 usdc to gentle every day for 5 days",
    );
    assert.ok(result);
    assert.deepEqual(result.action, {
      type: "Recurring",
      recipient: "gentle",
      amountUsdc: 2,
      asset: "USDC",
      frequency: "daily",
      maxRuns: 5,
    });
  });

  it("converts durations into a payment count", () => {
    const runs = (text) => classifyMessage(text)?.action.maxRuns;
    assert.equal(runs("send 5 usdc to @ada weekly for 3 weeks"), 3);
    assert.equal(runs("send 5 usdc to @ada every day for 2 weeks"), 14);
    assert.equal(runs("send 5 usdc to @ada every fortnight for 4 weeks"), 2);
    assert.equal(runs("send 5 usdc to @ada monthly 6 times"), 6);
    assert.equal(runs("pay 5 to @ada every month for 2 quarters"), 6);
  });

  it("stays open-ended with no duration", () => {
    const result = classifyMessage("send 5 usdc to @ada every month");
    assert.equal(result?.action.type, "Recurring");
    assert.equal(result?.action.maxRuns, undefined);
  });

  it("escalates schedule details it can't read instead of guessing", () => {
    // Uneven duration, and explicit dates: both go to Tier 2.
    assert.equal(classifyMessage("send 5 usdc to @ada weekly for 10 days"), null);
    assert.equal(classifyMessage("send 5 usdc to @ada every day starting tomorrow"), null);
    assert.equal(classifyMessage("send 5 usdc to @ada monthly until december"), null);
  });

  it("never downgrades an unreadable schedule to a one-off send", () => {
    const result = classifyMessage("send 5 usdc to @ada every day from monday");
    assert.notEqual(result?.action.type, "PaymentIntent");
  });
});

describe("Tier 1 — split with extra payments", () => {
  it("splits among the named people and adds the separate payment", () => {
    const result = classifyMessage(
      "split 5 usdc among gentle and cypher and send $2 to arc_studio",
    );
    assert.ok(result);
    assert.deepEqual(result.action, {
      type: "BatchPay",
      asset: "USDC",
      legs: [
        { amountUsdc: 2.5, recipient: "gentle" },
        { amountUsdc: 2.5, recipient: "cypher" },
        { amountUsdc: 2, recipient: "arc_studio" },
      ],
    });
  });

  it("keeps @ only where the user typed it (username vs contact)", () => {
    assert.equal(classifyMessage("send 5 usdc to @gentle")?.action.recipient, "@gentle");
    assert.equal(classifyMessage("send 5 usdc to gentle")?.action.recipient, "gentle");
  });

  it("still reads comma-separated names", () => {
    const legs = classifyMessage("split 9 usdc among @a1, @b2 and @c3")?.action.legs;
    assert.deepEqual(legs?.map((leg) => leg.recipient), ["@a1", "@b2", "@c3"]);
  });

  it("escalates when the extra instruction isn't a plain payment", () => {
    assert.equal(classifyMessage("split 6 usdc among @a1 and @b2 and pay the rest later"), null);
  });

  it("reads an extra payment written recipient-first", () => {
    const result = classifyMessage(
      "split 2 usdc among gentle, cypher and send arc_studio 2usdc",
    );
    assert.deepEqual(result?.action, {
      type: "BatchPay",
      asset: "USDC",
      legs: [
        { amountUsdc: 1, recipient: "gentle" },
        { amountUsdc: 1, recipient: "cypher" },
        { amountUsdc: 2, recipient: "arc_studio" },
      ],
    });
  });

  it("never shrinks a split it can't read to a single send", () => {
    assert.equal(
      classifyMessage("split 2 usdc among gentle, cypher and send arc_studio some"),
      null,
    );
    assert.equal(classifyMessage("split it with gentle and send arc_studio 2"), null);
  });

  it("reads recipient-first batches and thousands separators", () => {
    assert.deepEqual(classifyMessage("pay @a1 5, @b2 6")?.action.legs, [
      { amountUsdc: 5, recipient: "@a1" },
      { amountUsdc: 6, recipient: "@b2" },
    ]);
    assert.deepEqual(
      classifyMessage("send 1,250 to @a1 and 5 to @b2")?.action.legs,
      [
        { amountUsdc: 1250, recipient: "@a1" },
        { amountUsdc: 5, recipient: "@b2" },
      ],
    );
  });

  it("reads a batch leg with the “to” left out", () => {
    assert.deepEqual(
      classifyMessage("send 2usdc to gentle and 2usdc cypher")?.action,
      {
        type: "BatchPay",
        asset: "USDC",
        legs: [
          { amountUsdc: 2, recipient: "gentle" },
          { amountUsdc: 2, recipient: "cypher" },
        ],
      },
    );
  });

  it("never shrinks a two-amount message to a single send", () => {
    assert.equal(classifyMessage("send 2usdc to gentle and cypher gets 2usdc"), null);
    assert.equal(classifyMessage("send 5 to @a1 and 6 more"), null);
  });

  it("keeps the split's asset and escalates a mixed-asset batch", () => {
    assert.equal(classifyMessage("split 10 eurc between @a1 and @b2")?.action.asset, "EURC");
    assert.equal(
      classifyMessage("split 10 eurc between @a1 and @b2 and send 2 usdc to @c3"),
      null,
    );
  });
});

describe("Tier 1 — payment notes", () => {
  it("reads “for …” after a send as its note", () => {
    assert.deepEqual(classifyMessage("send 5 usdc to @ada for lunch")?.action, {
      type: "PaymentIntent",
      recipient: "@ada",
      amountUsdc: 5,
      asset: "USDC",
      note: "lunch",
    });
    assert.equal(classifyMessage("pay bob 20 for the concert tickets")?.action.note, "the concert tickets");
  });

  it("reads explicit note and memo markers", () => {
    for (const [message, note] of [
      ["send 5 to @ada note: June rent", "June rent"],
      ["send 5 to @ada, memo: invoice 12", "invoice 12"],
      ["send 5 to @ada with a note saying thanks!", "thanks!"],
      ["send 5 to @ada and add a note: \"Happy birthday\"", "Happy birthday"],
      ["send 5 to @ada (note: rent)", "rent"],
    ]) {
      const action = classifyMessage(message)?.action;
      assert.equal(action?.recipient, "@ada", message);
      assert.equal(action?.note, note, message);
    }
  });

  it("puts a note on batches and splits", () => {
    assert.equal(
      classifyMessage("split 30 usdc between @a1 and @b2 for dinner")?.action.note,
      "dinner",
    );
    const split = classifyMessage("split 30 usdc between @a1 and @b2 for dinner")?.action;
    assert.deepEqual(split?.legs.map((leg) => leg.recipient), ["@a1", "@b2"]);
    assert.equal(
      classifyMessage("send 5 to @a1 and 6 to @b2, note: team lunch")?.action.note,
      "team lunch",
    );
  });

  it("puts a note on requests", () => {
    assert.equal(classifyMessage("request 20 usdc from @sam for dinner")?.action.note, "dinner");
  });

  it("does not mistake names or schedules for notes", () => {
    assert.equal(classifyMessage("send 5 to @memo")?.action.recipient, "@memo");
    assert.equal(classifyMessage("send 5 to @memo")?.action.note, undefined);
    assert.equal(classifyMessage("send 5 usdc to @ada for 3 weeks"), null);
    assert.equal(classifyMessage("send 5 usdc to @ada every friday"), null);
  });
});

describe("Recurring actions from the LLM", () => {
  it("keeps valid start, end and run cap", () => {
    const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19) + "+01:00";
    const end = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 19) + "+01:00";
    const action = parseAllieAction(JSON.stringify({
      type: "Recurring",
      recipient: "@ada",
      amountUsdc: 2,
      asset: "USDC",
      frequency: "daily",
      startsAt: start,
      endsAt: end,
      maxRuns: 5,
    }));
    assert.equal(action?.startsAt, start);
    assert.equal(action?.endsAt, end);
    assert.equal(action?.maxRuns, 5);
  });

  it("drops a past start, an end before the start, and a bad run cap", () => {
    const action = parseAllieAction(JSON.stringify({
      type: "Recurring",
      recipient: "@ada",
      amountUsdc: 2,
      asset: "USDC",
      frequency: "daily",
      startsAt: "2020-01-01T09:00:00Z",
      endsAt: "2020-01-02T09:00:00Z",
      maxRuns: -3,
    }));
    assert.equal(action?.startsAt, undefined);
    assert.equal(action?.endsAt, undefined);
    assert.equal(action?.maxRuns, undefined);
  });
});

describe("Contacts as recipients", async () => {
  const { matchContact } = await import("@/lib/payment-engine/contacts");
  const contacts = [
    { name: "Mum", wallet: "0x1111111111111111111111111111111111111111" },
    { name: "John", wallet: "0x2222222222222222222222222222222222222222" },
    { name: "John Doe", wallet: "0x3333333333333333333333333333333333333333" },
  ];

  it("matches a saved name regardless of case or a stray @", () => {
    assert.equal(matchContact(contacts, "mum")?.name, "Mum");
    assert.equal(matchContact(contacts, "@MUM")?.name, "Mum");
    assert.equal(matchContact(contacts, "gentle"), null);
  });

  it("prefers the multi-word contact the message actually names", () => {
    // Tier 1 reads one word, so "John Doe" arrives as "John".
    assert.equal(
      matchContact(contacts, "John", "send 5 usdc to John Doe")?.name,
      "John Doe",
    );
    assert.equal(matchContact(contacts, "John", "send 5 usdc to John")?.name, "John");
    // "John Doer" is not "John Doe".
    assert.equal(matchContact(contacts, "John", "send 5 usdc to John Doer")?.name, "John");
  });
});
