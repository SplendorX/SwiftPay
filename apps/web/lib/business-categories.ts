/** The business categories offered in onboarding and Settings. */
export const businessCategories = [
  "Agency & professional services",
  "Consulting",
  "Creator & freelancer",
  "Education & training",
  "E-commerce & retail",
  "Events & entertainment",
  "Finance & crypto",
  "Food & hospitality",
  "Health & wellness",
  "Logistics & delivery",
  "Media & publishing",
  "Non-profit",
  "Real estate",
  "Software & SaaS",
  "Travel & tourism",
  "Other",
] as const;

/**
 * Select options for a category field. A category saved before the list
 * existed stays selectable, so opening the form never silently changes it.
 */
export function businessCategoryOptions(current: string) {
  const options: Array<{ label: string; value: string }> = [
    { label: "Select a category", value: "" },
    ...businessCategories.map((category) => ({ label: category, value: category })),
  ];
  const saved = current.trim();
  if (saved && !businessCategories.some((category) => category === saved)) {
    options.splice(1, 0, { label: saved, value: saved });
  }
  return options;
}

/** Employee bands offered in Settings; stored in business_size. */
export const employeeBands = ["Just me", "2–10", "11–50", "51–200", "201–500", "501–1,000", "1,000+"] as const;

/** Yearly payment volume bands, in USD. */
export const annualVolumeBands = [
  "Under $10k",
  "$10k–$100k",
  "$100k–$1M",
  "$1M–$10M",
  "$10M+",
] as const;

/** Select options for an optional band field, with a "Not specified" choice. */
export function bandOptions(bands: readonly string[], current: string) {
  const options: Array<{ label: string; value: string }> = [
    { label: "Not specified", value: "" },
    ...bands.map((band) => ({ label: band, value: band })),
  ];
  const saved = current.trim();
  if (saved && !bands.includes(saved)) options.push({ label: saved, value: saved });
  return options;
}
