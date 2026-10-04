/**
 * Only same-site paths survive as a post-sign-in destination.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/__tests__/sign-in-destination.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readSafeNextPath, resolveSignInDestination } from "@/lib/sign-in-destination";

describe("readSafeNextPath", () => {
  it("accepts a prefilled send link", () => {
    const next = "/send?to=0x1111111111111111111111111111111111111111&amount=6&token=USDC&memo=AB12CD34EF&charge=AB12CD34EF";
    assert.equal(readSafeNextPath(next), next);
    assert.equal(readSafeNextPath("/business/checkout"), "/business/checkout");
  });

  it("rejects other origins and traversal", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/javascript:alert(1)",
      "/..",
      "/send/../admin",
      "/%2e%2e/admin",
      "/\t/evil.example",
      "send",
      "",
      "/",
      null,
      42,
    ]) {
      assert.equal(readSafeNextPath(value), null, String(value));
    }
  });
});

describe("resolveSignInDestination", () => {
  it("onboards an account that is not set up, whatever next says", () => {
    assert.equal(
      resolveSignInDestination({ accountTypeSelected: false, isBusiness: false, next: "/send" }),
      "/onboarding",
    );
  });

  it("honours a safe next for a set-up account", () => {
    assert.equal(
      resolveSignInDestination({ accountTypeSelected: true, isBusiness: false, next: "/send?charge=X" }),
      "/send?charge=X",
    );
  });

  it("falls back to the home for the account type", () => {
    assert.equal(
      resolveSignInDestination({ accountTypeSelected: true, isBusiness: true, next: "//evil" }),
      "/business",
    );
    assert.equal(
      resolveSignInDestination({ accountTypeSelected: true, isBusiness: false }),
      "/dashboard",
    );
  });
});
