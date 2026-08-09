import { redirect } from "next/navigation";

/** Confidential payments live in PrivSwiftPay (claim-code escrow). */
export default function ConfidentialRedirectPage() {
  redirect("/privSwiftPay");
}
