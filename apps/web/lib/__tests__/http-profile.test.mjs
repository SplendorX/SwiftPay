/**
 * Unit tests for safe JSON parsing and null reference protection in HTTP handlers.
 * Run: node --test apps/web/lib/__tests__/http-profile.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Pure helper function mirroring apps/web/lib/http.ts readJsonRecord
async function readJsonRecord(request) {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

describe("readJsonRecord", () => {
  it("returns null when JSON body is literal null", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns null when JSON body is a number primitive", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "123",
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns null when JSON body is a string primitive", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '"hello"',
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns null when JSON body is a boolean primitive", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "false",
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns null when JSON body is an array", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns null when JSON body is malformed", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json }",
    });
    const result = await readJsonRecord(req);
    assert.equal(result, null);
  });

  it("returns parsed object when body is a valid JSON record", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "0x1234567890123456789012345678901234567890" }),
    });
    const result = await readJsonRecord(req);
    assert.deepEqual(result, {
      walletAddress: "0x1234567890123456789012345678901234567890",
    });
  });
});
