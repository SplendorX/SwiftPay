/**
 * Environment variables renamed in the SaphraONE rebrand (SWIFTPAY_* →
 * SAPHRA_*, SWIFTPOINTS_* → ONE_POINTS_*). The code reads only the new
 * names; this copies a value set under the old name onto the new one when
 * the new one is missing, so a deployment that still has the old names in
 * Vercel keeps working. Import it for its side effect before reading any of
 * these. Once every environment has the new names, delete this file.
 */
const renamed: Record<string, string> = {
  SAPHRA_ALLOWED_ORIGINS: "SWIFTPAY_ALLOWED_ORIGINS",
  SAPHRA_CIRCLE_TREASURY_ADDRESS: "SWIFTPAY_CIRCLE_TREASURY_ADDRESS",
  SAPHRA_CIRCLE_TREASURY_PRIVATE_KEY: "SWIFTPAY_CIRCLE_TREASURY_PRIVATE_KEY",
  SAPHRA_EARN_OPERATOR_ADDRESS: "SWIFTPAY_EARN_OPERATOR_ADDRESS",
  SAPHRA_EARN_OPERATOR_PRIVATE_KEY: "SWIFTPAY_EARN_OPERATOR_PRIVATE_KEY",
  SAPHRA_MFA_KEY: "SWIFTPAY_MFA_KEY",
  SAPHRA_PAYROLL_OPERATOR_ADDRESS: "SWIFTPAY_PAYROLL_OPERATOR_ADDRESS",
  SAPHRA_PAYROLL_OPERATOR_PRIVATE_KEY: "SWIFTPAY_PAYROLL_OPERATOR_PRIVATE_KEY",
  SAPHRA_RECURRING_OPERATOR_ADDRESS: "SWIFTPAY_RECURRING_OPERATOR_ADDRESS",
  SAPHRA_RECURRING_OPERATOR_PRIVATE_KEY: "SWIFTPAY_RECURRING_OPERATOR_PRIVATE_KEY",
  SAPHRA_SESSION_SECRET: "SWIFTPAY_SESSION_SECRET",
  ONE_POINTS_MAX_PAYOUT_USDC: "SWIFTPOINTS_MAX_PAYOUT_USDC",
  ONE_POINTS_TREASURY_ADDRESS: "SWIFTPOINTS_TREASURY_ADDRESS",
  ONE_POINTS_TREASURY_PRIVATE_KEY: "SWIFTPOINTS_TREASURY_PRIVATE_KEY",
  ONE_POINTS_USD_PER_POINT: "SWIFTPOINTS_USD_PER_POINT",
};

for (const [name, legacy] of Object.entries(renamed)) {
  const legacyValue = process.env[legacy];
  if (!process.env[name]?.trim() && legacyValue?.trim()) {
    process.env[name] = legacyValue;
  }
}

export {};
