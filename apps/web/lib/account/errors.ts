import {
  BusinessHttpError,
  businessErrors,
  isBusinessHttpError,
} from "@/lib/business/errors";

export { BusinessHttpError, isBusinessHttpError };

export const accountErrors = {
  ...businessErrors,
  alreadyBusiness: () =>
    new BusinessHttpError({
      code: "ACCOUNT_ALREADY_BUSINESS",
      status: 409,
      userMessage: "This account is already a Business account.",
    }),
  businessRequired: () =>
    new BusinessHttpError({
      code: "BUSINESS_ACCOUNT_REQUIRED",
      status: 403,
      userMessage: "A Business account is required for this action.",
    }),
  invalidTransition: () =>
    new BusinessHttpError({
      code: "INVALID_ACCOUNT_TYPE_TRANSITION",
      status: 400,
      userMessage: "Business accounts cannot be changed back to Personal.",
    }),
  profileRequired: () =>
    new BusinessHttpError({
      code: "BUSINESS_PROFILE_REQUIRED",
      status: 400,
      userMessage: "Create a business profile first.",
    }),
  invoiceNotFound: () =>
    new BusinessHttpError({
      code: "INVOICE_NOT_FOUND",
      status: 404,
      userMessage: "Invoice was not found.",
    }),
  invoiceNotOwned: () =>
    new BusinessHttpError({
      code: "INVOICE_NOT_OWNED",
      status: 403,
      userMessage: "You cannot access that invoice.",
    }),
  invoiceAlreadyPaid: () =>
    new BusinessHttpError({
      code: "INVOICE_ALREADY_PAID",
      status: 409,
      userMessage: "This invoice has already been paid.",
    }),
  invalidInvoiceStatus: (message?: string) =>
    new BusinessHttpError({
      code: "INVALID_INVOICE_STATUS",
      status: 400,
      userMessage: message ?? "That invoice status change is not allowed.",
    }),
  invalidPayment: (message?: string) =>
    new BusinessHttpError({
      code: "INVALID_PAYMENT",
      status: 400,
      userMessage: message ?? "This payment does not match the invoice.",
    }),
};
