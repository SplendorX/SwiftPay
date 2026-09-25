/**
 * Business verification: who's eligible, what each country can submit, and
 * how a register's answer becomes approved / rejected / sent to a person.
 *
 * Run: pnpm --filter @swiftpay/web test:business-verification
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  businessIdShapeError,
  decideFromRegistry,
  namesMatch,
  normalizeBusinessId,
} from "@/lib/business/registry-check";
import { businessIdOptions } from "@/lib/business/registry-sources";
import {
  businessVerificationStatus,
  missingVerificationFields,
} from "@/lib/business/verification";

const complete = {
  businessName: "Olu Ltd",
  logoUrl: "data:image/png;base64,x",
  description: "Electronics",
  category: "E-commerce & retail",
  website: "https://olu.ng",
  contactEmail: "hi@olu.ng",
  country: "Nigeria",
};

describe("eligibility", () => {
  it("doesn't need a phone or the optional details", () => {
    assert.deepEqual(missingVerificationFields(complete), []);
  });

  it("names what's missing", () => {
    assert.deepEqual(missingVerificationFields({ ...complete, website: " ", logoUrl: null }), ["Logo", "Website"]);
  });

  it("verifies only a complete profile with an approved review", () => {
    assert.equal(businessVerificationStatus(complete), "UNVERIFIED");
    assert.equal(businessVerificationStatus(complete, "PENDING"), "PENDING");
    assert.equal(businessVerificationStatus(complete, "REJECTED"), "UNVERIFIED");
    assert.equal(businessVerificationStatus(complete, "APPROVED"), "VERIFIED");
    assert.equal(businessVerificationStatus({ ...complete, website: "" }, "APPROVED"), "UNVERIFIED");
  });
});

describe("ID options per country", () => {
  const types = (code, keys) => businessIdOptions(code, keys).map((option) => `${option.type}:${option.automatic}`);

  it("checks EU VAT and French SIREN instantly", () => {
    assert.deepEqual(types("FR"), ["REGISTRATION:true", "VAT:true", "LEI:true"]);
    assert.deepEqual(types("DE"), ["REGISTRATION:false", "VAT:true", "LEI:true"]);
  });

  it("checks the UK and Australia only once their free keys are set", () => {
    assert.deepEqual(types("GB"), ["REGISTRATION:false", "TAX:false", "LEI:true"]);
    assert.deepEqual(types("GB", { companiesHouse: true }), ["REGISTRATION:true", "TAX:false", "LEI:true"]);
    assert.deepEqual(types("AU", { abnLookup: true }), ["REGISTRATION:true", "LEI:true"]);
  });

  it("sends Nigeria and the US to a reviewer, with LEI as the instant option", () => {
    assert.deepEqual(types("NG"), ["REGISTRATION:false", "TAX:false", "LEI:true"]);
    assert.equal(businessIdOptions("US")[1].label, "EIN");
  });
});

describe("normalising IDs", () => {
  it("strips spacing and country prefixes", () => {
    assert.equal(normalizeBusinessId("VAT", "IE", "IE 6388047V"), "6388047V");
    assert.equal(normalizeBusinessId("VAT", "GR", "EL-094014201"), "094014201");
    assert.equal(normalizeBusinessId("REGISTRATION", "NG", "RC 1234567"), "1234567");
    assert.equal(normalizeBusinessId("REGISTRATION", "FR", "552 032 534"), "552032534");
  });

  it("catches obvious typos before any register is asked", () => {
    assert.equal(businessIdShapeError("LEI", "NG", "5493001KJTIIGC8Y1R12"), null);
    assert.ok(businessIdShapeError("LEI", "NG", "5493001KJT"));
    assert.ok(businessIdShapeError("REGISTRATION", "FR", "55203253"));
    assert.ok(businessIdShapeError("REGISTRATION", "NO", "12345"));
    assert.ok(businessIdShapeError("TAX", "NG", "12"));
  });
});

describe("matching names", () => {
  it("ignores case, punctuation and legal forms", () => {
    assert.ok(namesMatch("Olu Ltd", "OLU LIMITED"));
    assert.ok(namesMatch("Google Ireland", "GOOGLE IRELAND LIMITED"));
    assert.ok(namesMatch("Café Du Monde S.A.S.", "CAFE DU MONDE"));
    assert.ok(namesMatch("Danone", "DANONE"));
  });

  it("sends anything looser to a person", () => {
    assert.equal(namesMatch("Acme Design Studio", "ACME LIMITED"), false);
    assert.equal(namesMatch("Olu Ltd", "Bolu Enterprises"), false);
    assert.equal(namesMatch("Ltd", "LIMITED"), false);
  });
});

describe("deciding from the register", () => {
  const found = (overrides = {}) => ({
    kind: "found",
    source: "EU VIES",
    active: true,
    name: "OLU LIMITED",
    country: "IE",
    ...overrides,
  });

  it("approves a clean match on its own", () => {
    const decision = decideFromRegistry(found(), "Olu Ltd", "IE");
    assert.equal(decision.status, "APPROVED");
    assert.equal(decision.method, "AUTOMATIC");
  });

  it("rejects an unknown number or a closed business with the reason", () => {
    assert.equal(decideFromRegistry({ kind: "not_found", source: "GLEIF" }, "Olu", "IE").status, "REJECTED");
    const closed = decideFromRegistry(found({ active: false, status: "dissolved" }), "Olu Ltd", "IE");
    assert.equal(closed.status, "REJECTED");
    assert.match(closed.reason, /dissolved/);
  });

  it("sends mismatches and outages to a reviewer, never approving them", () => {
    for (const [result, name, country] of [
      [found({ name: "SOMEONE ELSE LTD" }), "Olu Ltd", "IE"],
      [found({ country: "GB" }), "Olu Ltd", "IE"],
      [found({ name: null }), "Olu Ltd", "IE"],
      [{ kind: "unavailable", note: "No register" }, "Olu Ltd", "NG"],
    ]) {
      const decision = decideFromRegistry(result, name, country);
      assert.equal(decision.status, "PENDING");
      assert.equal(decision.method, "MANUAL");
      assert.ok(decision.note);
    }
  });
});
