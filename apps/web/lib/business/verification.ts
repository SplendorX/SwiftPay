/**
 * When a business counts as verified: every required field on its profile
 * settings is filled in. Phone, employee band, year founded and annual
 * volume are optional and never count. One rule, shared by every place that
 * saves a business profile and by the settings page that shows what's missing.
 */
export type BusinessVerificationFields = {
  businessName?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  category?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  country?: string | null;
  phone?: string | null;
};

const requiredFields: { key: keyof BusinessVerificationFields; label: string }[] = [
  { key: "logoUrl", label: "Logo" },
  { key: "businessName", label: "Business name" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "website", label: "Website" },
  { key: "contactEmail", label: "Contact email" },
  { key: "country", label: "Country" },
];

function filled(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

/** The profile settings still empty, as their on-screen labels. */
export function missingVerificationFields(fields: BusinessVerificationFields) {
  return requiredFields.filter(({ key }) => !filled(fields[key])).map(({ label }) => label);
}

export function isBusinessProfileComplete(fields: BusinessVerificationFields) {
  return missingVerificationFields(fields).length === 0;
}

export type BusinessReviewStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export function readReviewStatus(value: unknown): BusinessReviewStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED" ? value : "NONE";
}

/**
 * A complete profile unlocks review; only an approved review verifies. A
 * profile that later loses a required field drops back to unverified until
 * it's filled in again — the approval itself is kept.
 */
export function businessVerificationStatus(
  fields: BusinessVerificationFields,
  review: BusinessReviewStatus = "NONE",
) {
  if (!isBusinessProfileComplete(fields)) return "UNVERIFIED" as const;
  if (review === "APPROVED") return "VERIFIED" as const;
  if (review === "PENDING") return "PENDING" as const;
  return "UNVERIFIED" as const;
}
