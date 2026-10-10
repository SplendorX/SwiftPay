/**
 * The network registry: one entry per network, consistent ids, and the
 * enabled-list filter.
 *
 * Run: node --experimental-strip-types --import ./lib/payment-engine/__tests__/register.mjs \
 *        --test lib/multichain/__tests__/chains.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MULTICHAIN_CHAINS,
  multichainChainByCircleBlockchain,
  multichainChainByKey,
} from "@/lib/multichain/chains";
import { enabledMultichainChains } from "@/lib/multichain/flag";

describe("registry", () => {
  it("lists six networks with unique keys, ids and domains", () => {
    assert.equal(MULTICHAIN_CHAINS.length, 6);
    for (const field of ["key", "chainId", "circleBlockchain", "cctpDomain", "appKitChain"]) {
      assert.equal(new Set(MULTICHAIN_CHAINS.map((chain) => chain[field])).size, 6, field);
    }
  });

  it("uses Circle's CCTP domains", () => {
    const domains = Object.fromEntries(MULTICHAIN_CHAINS.map((chain) => [chain.key, chain.cctpDomain]));
    assert.deepEqual(domains, { arbitrum: 3, avalanche: 1, base: 6, ethereum: 0, optimism: 2, polygon: 7 });
  });

  it("is testnet by default", () => {
    assert.equal(multichainChainByKey("base")?.circleBlockchain, "BASE-SEPOLIA");
    assert.equal(multichainChainByCircleBlockchain("MATIC-AMOY")?.key, "polygon");
    assert.equal(multichainChainByCircleBlockchain("BASE"), null);
    assert.equal(multichainChainByKey("tron"), null);
  });
});

describe("enabledMultichainChains", () => {
  it("narrows to the configured keys", () => {
    const previous = process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS;
    try {
      process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS = "base, Polygon";
      assert.deepEqual(enabledMultichainChains().map((chain) => chain.key), ["base", "polygon"]);
      delete process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS;
      assert.equal(enabledMultichainChains().length, 6);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS;
      else process.env.NEXT_PUBLIC_MULTICHAIN_NETWORKS = previous;
    }
  });
});
