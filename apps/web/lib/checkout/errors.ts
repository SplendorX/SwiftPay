import { BusinessHttpError, accountErrors } from "@/lib/account/errors";

export const checkoutErrors = {
  ...accountErrors,
  chargeNotFound: () =>
    new BusinessHttpError({
      code: "CHARGE_NOT_FOUND",
      status: 404,
      userMessage: "That charge was not found. Check the code and try again.",
    }),
  chargeNotOpen: (message?: string) =>
    new BusinessHttpError({
      code: "CHARGE_NOT_OPEN",
      status: 409,
      userMessage: message ?? "This charge can no longer be paid.",
    }),
  chargeNotOwned: () =>
    new BusinessHttpError({
      code: "CHARGE_NOT_OWNED",
      status: 403,
      userMessage: "You cannot access that charge.",
    }),
  invalidCharge: (message: string) =>
    new BusinessHttpError({
      code: "INVALID_CHARGE",
      status: 400,
      userMessage: message,
    }),
  storefrontNotFound: () =>
    new BusinessHttpError({
      code: "STOREFRONT_NOT_FOUND",
      status: 404,
      userMessage: "That business was not found on SaphraONE.",
    }),
  onrampUnavailable: () =>
    new BusinessHttpError({
      code: "ONRAMP_UNAVAILABLE",
      status: 503,
      userMessage: "Card and bank payments are not available right now.",
    }),
  rateLimited: () =>
    new BusinessHttpError({
      code: "RATE_LIMITED",
      status: 429,
      userMessage: "Too many attempts. Wait a moment and try again.",
    }),
};
