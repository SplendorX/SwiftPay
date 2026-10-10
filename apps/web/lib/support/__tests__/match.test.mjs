/**
 * The support assistant's matching: the ways people actually ask, and the
 * cases that must reach a person.
 *
 * Run: pnpm --filter @saphra/web test:support
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { supportArticles } from "@/lib/support/knowledge";
import { replyTo, suggestedArticles } from "@/lib/support/match";

const answered = (message, path = null) => {
  const reply = replyTo(message, path);
  return reply.kind === "answer" ? reply.article.id : reply.kind;
};

describe("answers the common questions", () => {
  for (const [message, id] of [
    ["what are your fees", "fees"],
    ["how much does it cost to send money", "fees"],
    ["how do i send usdc to a friend", "send-money"],
    ["my payment is stuck pending", "payment-pending"],
    ["money didn't arrive", "payment-pending"],
    ["i sent money to the wrong address", "wrong-address"],
    ["how do I get verified", "business-verification"],
    ["where do i put my CAC number", "business-verification"],
    ["my verification was rejected", "verification-rejected"],
    ["how do i create an invoice", "create-invoice"],
    ["customer paid but invoice still unpaid", "invoice-unpaid"],
    ["how to run payroll", "payroll-run"],
    ["cancel my subscription payment", "delete-schedule"],
    ["how do i swap usdc to eurc", "swap"],
    ["what is allie", "allie"],
    ["how do one-points work", "swiftpoints"],
    ["how do i deposit money", "add-funds"],
    ["pay many people at once", "batchpay"],
    ["how do I log in with metamask", "sign-in-options"],
    ["hide my balance", "display-settings"],
    ["does support ask for seed phrase", "seed-phrase"],
    ["invite a friend referral", "referrals"],
  ]) {
    it(`“${message}”`, () => assert.equal(answered(message), id));
  }
});

describe("conversation", () => {
  it("greets and thanks without searching", () => {
    assert.equal(replyTo("hi").kind, "greeting");
    assert.equal(replyTo("thanks!").kind, "thanks");
  });

  it("hands to a person when asked", () => {
    assert.equal(replyTo("I want to talk to a human").kind, "human");
    assert.equal(replyTo("contact support").kind, "human");
  });

  it("offers a person when nothing fits", () => {
    assert.equal(replyTo("the colour of the sky").kind, "unknown");
  });
});

describe("urgent problems", () => {
  it("flags stolen funds and hacks for a person, with the security steps", () => {
    const reply = replyTo("my wallet was hacked and drained");
    assert.equal(reply.kind, "answer");
    assert.equal(reply.article.id, "account-compromised");
    assert.equal(reply.urgent, true);
  });

  it("flags urgency even when the rest is unclear", () => {
    const reply = replyTo("fraud!!");
    assert.ok(reply.kind === "human" || (reply.kind === "answer" && reply.urgent));
  });
});

describe("context", () => {
  it("puts the page's own topics first", () => {
    assert.equal(suggestedArticles("/business/payroll/runs/1")[0].id, "payroll-run");
    assert.equal(suggestedArticles("/invoice/abc")[0].id, "pay-invoice");
  });

  it("keeps every article reachable by its own title", () => {
    for (const article of supportArticles) {
      const reply = replyTo(article.title);
      const hit =
        (reply.kind === "answer" && reply.article.id === article.id) ||
        (reply.kind === "suggest" && reply.articles.some((candidate) => candidate.id === article.id));
      assert.ok(hit, `${article.id} → ${JSON.stringify(reply.kind === "answer" ? reply.article.id : reply)}`);
    }
  });
});
