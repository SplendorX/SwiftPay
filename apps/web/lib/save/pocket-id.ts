import { keccak256, stringToBytes, type Hex } from "viem";

/** Deterministic on-chain pocket id from DB uuid. */
export function pocketIdToBytes32(pocketId: string): Hex {
  return keccak256(stringToBytes(`swiftpay:save:pocket:${pocketId.toLowerCase()}`));
}
