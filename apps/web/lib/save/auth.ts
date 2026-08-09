/**
 * Re-export wallet ownership checks used by Swift+Save APIs.
 * Same session + Circle social binding model as SwiftRecurepay.
 */
export {
  assertRecurringAccess as assertSavingsAccess,
  getSessionOwnerWallet,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
