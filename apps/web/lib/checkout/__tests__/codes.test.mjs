/**
 * Charge codes: Crockford base32, 10 characters, look-alikes folded.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/checkout/__tests__/codes.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHARGE_CODE_ALPHABET,
  CHARGE_CODE_LENGTH,
  generateChargeCode,
  normalizeChargeCode,
} from "@/lib/checkout/codes";

describe("generateChargeCode", () => {
  it("draws 10 characters from the Crockford alphabet", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateChargeCode();
      assert.equal(code.length, CHARGE_CODE_LENGTH);
      for (const char of code) assert.ok(CHARGE_CODE_ALPHABET.includes(char), code);
    }
  });

  it("never uses I, L, O or U", () => {
    assert.doesNotMatch(CHARGE_CODE_ALPHABET, /[ILOU]/);
  });

  it("is deterministic for given bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(generateChargeCode(bytes), generateChargeCode(bytes));
    assert.equal(generateChargeCode(new Uint8Array(8)), "0000000000");
  });
});

describe("normalizeChargeCode", () => {
  it("uppercases and folds O to 0 and I/L to 1", () => {
    assert.equal(normalizeChargeCode("ab0o1il2c3"), "AB001112C3");
  });

  it("drops spaces and dashes", () => {
    assert.equal(normalizeChargeCode(" ABCDE-FGH12 "), "ABCDEFGH12");
  });

  it("rejects the wrong length, U, symbols and non-strings", () => {
    assert.equal(normalizeChargeCode("ABC"), null);
    assert.equal(normalizeChargeCode("ABCDEFGHJKM"), null);
    assert.equal(normalizeChargeCode("ABCDEFGHJU"), null);
    assert.equal(normalizeChargeCode("ABCDEFGH/1"), null);
    assert.equal(normalizeChargeCode(undefined), null);
  });
});
