import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";

import { loadAccount, requireAuthenticatedAccount, requireBusinessAccount } from "@/lib/account/auth";
import { accountDb, accountTables, readAccountDbError } from "@/lib/account/db";
import { accountErrors } from "@/lib/account/errors";
import { moneyNumber, parseMoney, roundMoney } from "@/lib/account/money";
import type {
  AccountType,
  BusinessAccountProfile,
  BusinessAsset,
  InvoiceItemInput,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  InvoiceSummary,
  InvoiceWithItems,
} from "@/lib/account/types";
import { createSavingsNotificationResult } from "@/lib/save/notifications";
import { normalizeUsername, validateUsername } from "@/lib/profile-utils";

function nowIso() {
  return new Date().toISOString();
}

function optionalText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function isAsset(value: unknown): value is BusinessAsset {
  return value === "USDC" || value === "EURC";
}

async function writeHistory(input: {
  actorWallet: string;
  newType: AccountType;
  previousType: AccountType;
  reason: "USER_ONBOARDING" | "USER_UPGRADE";
  wallet: string;
}) {
  const supabase = accountDb();
  await supabase.from(accountTables.history).insert({
    actor_wallet: input.actorWallet,
    created_at: nowIso(),
    metadata: {},
    new_type: input.newType,
    previous_type: input.previousType,
    reason: input.reason,
    wallet_address: input.wallet,
  });
}

export async function getAccountState(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
}) {
  const { account, actorWallet } = await requireAuthenticatedAccount(input);
  const profile =
    account.account_type === "BUSINESS"
      ? await loadBusinessProfile(actorWallet)
      : null;
  return { account, profile };
}

export async function loadBusinessProfile(wallet: string) {
  const supabase = accountDb();
  const { data, error } = await supabase
    .from(accountTables.businessProfiles)
    .select("*")
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error) {
    throw new Error(readAccountDbError(error, "Could not load the business profile."));
  }
  return (data as BusinessAccountProfile | null) ?? null;
}

async function upsertBusinessProfile(
  wallet: string,
  input: {
    businessName: string;
    category?: string | null;
    contactEmail?: string | null;
    country?: string | null;
    currency?: BusinessAsset;
    description?: string | null;
    logoUrl?: string | null;
    website?: string | null;
  },
) {
  const name = input.businessName.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw accountErrors.invalid("Enter a business name up to 80 characters.");
  }
  const payload = {
    business_name: name,
    category: input.category ?? null,
    contact_email: input.contactEmail ?? null,
    country: input.country ?? null,
    currency: input.currency ?? "USDC",
    description: input.description ?? null,
    logo_url: input.logoUrl ?? null,
    updated_at: nowIso(),
    wallet_address: wallet.toLowerCase(),
    website: input.website ?? null,
  };
  const supabase = accountDb();
  const existing = await loadBusinessProfile(wallet);
  if (existing) {
    const mutation = await supabase
      .from(accountTables.businessProfiles)
      .update(payload)
      .eq("wallet_address", wallet.toLowerCase())
      .select("*")
      .single();
    if (mutation.error) {
      throw new Error(readAccountDbError(mutation.error, "Could not update the business profile."));
    }
    return mutation.data as BusinessAccountProfile;
  }
  const created = await supabase
    .from(accountTables.businessProfiles)
    .insert({ ...payload, created_at: nowIso(), verification_status: "UNVERIFIED" })
    .select("*")
    .single();
  if (created.error) {
    throw new Error(readAccountDbError(created.error, "Could not create the business profile."));
  }
  return created.data as BusinessAccountProfile;
}

async function setAccountType(input: {
  actorWallet: string;
  newType: AccountType;
  previousType: AccountType;
  reason: "USER_ONBOARDING" | "USER_UPGRADE";
  wallet: string;
}) {
  if (input.previousType === "BUSINESS" && input.newType === "PERSONAL") {
    throw accountErrors.invalidTransition();
  }
  if (input.previousType === input.newType) {
    return;
  }
  const supabase = accountDb();
  const mutation = await supabase
    .from(accountTables.profiles)
    .update({
      account_type: input.newType,
      account_type_selected: true,
      account_upgraded_at: input.newType === "BUSINESS" ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq("wallet_address", input.wallet);
  if (mutation.error) {
    throw new Error(readAccountDbError(mutation.error, "Could not update account type."));
  }
  await writeHistory(input);
}

export async function completeAccountOnboarding(input: {
  accountKind: "personal" | "business";
  bio?: string | null;
  businessCategory?: string | null;
  businessDescription?: string | null;
  businessName?: string;
  circleSocialUuid?: unknown;
  locale: string;
  logoUrl?: string | null;
  ownerWallet: string;
  username: string;
  website?: string | null;
}) {
  const { account, actorWallet } = await requireAuthenticatedAccount({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: input.ownerWallet,
  });
  const username = normalizeUsername(input.username);
  const usernameError = validateUsername(username);
  if (usernameError) throw accountErrors.invalid(usernameError);
  const supabase = accountDb();
  await supabase
    .from(accountTables.profiles)
    .update({
      bio: typeof input.bio === "string" ? input.bio.trim().slice(0, 160) || null : account.bio,
      locale: input.locale || account.locale,
      onboarding_completed_at: nowIso(),
      username,
      updated_at: nowIso(),
    })
    .eq("wallet_address", actorWallet);

  if (input.accountKind === "business") {
    await upsertBusinessProfile(actorWallet, {
      businessName: input.businessName ?? "",
      category: input.businessCategory ?? null,
      description: input.businessDescription ?? null,
      logoUrl: input.logoUrl ?? null,
      website: input.website ?? null,
    });
    await setAccountType({
      actorWallet,
      newType: "BUSINESS",
      previousType: account.account_type,
      reason: "USER_ONBOARDING",
      wallet: actorWallet,
    });
  } else {
    await setAccountType({
      actorWallet,
      newType: "PERSONAL",
      previousType: account.account_type === "BUSINESS" ? "BUSINESS" : "PERSONAL",
      reason: "USER_ONBOARDING",
      wallet: actorWallet,
    });
    if (account.account_type !== "BUSINESS") {
      const supabaseProfile = accountDb();
      await supabaseProfile
        .from(accountTables.profiles)
        .update({ account_type_selected: true, updated_at: nowIso() })
        .eq("wallet_address", actorWallet);
    }
  }

  return getAccountState({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: actorWallet,
  });
}

export async function upgradeToBusiness(input: {
  businessCategory?: string | null;
  businessDescription?: string | null;
  businessName: string;
  circleSocialUuid?: unknown;
  confirmed: boolean;
  logoUrl?: string | null;
  ownerWallet: string;
  website?: string | null;
}) {
  if (!input.confirmed) {
    throw accountErrors.invalid("Confirm that this upgrade cannot be reversed.");
  }
  const { account, actorWallet } = await requireAuthenticatedAccount(input);
  if (account.account_type === "BUSINESS") {
    throw accountErrors.alreadyBusiness();
  }
  await upsertBusinessProfile(actorWallet, {
    businessName: input.businessName,
    category: input.businessCategory ?? null,
    description: input.businessDescription ?? null,
    logoUrl: input.logoUrl ?? null,
    website: input.website ?? null,
  });
  await setAccountType({
    actorWallet,
    newType: "BUSINESS",
    previousType: "PERSONAL",
    reason: "USER_UPGRADE",
    wallet: actorWallet,
  });
  return getAccountState({
    circleSocialUuid: input.circleSocialUuid,
    ownerWallet: actorWallet,
  });
}

export async function updateBusinessAccountProfile(input: {
  addressLine?: unknown;
  businessName?: unknown;
  category?: unknown;
  circleSocialUuid?: unknown;
  contactEmail?: unknown;
  country?: unknown;
  currency?: unknown;
  description?: unknown;
  industry?: unknown;
  logoUrl?: unknown;
  ownerWallet: unknown;
  phone?: unknown;
  website?: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const current = await loadBusinessProfile(actorWallet);
  if (!current) throw accountErrors.profileRequired();
  const next = await upsertBusinessProfile(actorWallet, {
    businessName:
      typeof input.businessName === "string" && input.businessName.trim()
        ? input.businessName
        : current.business_name,
    category: optionalText(input.category, 80) ?? current.category,
    contactEmail: optionalText(input.contactEmail, 160) ?? current.contact_email,
    country: optionalText(input.country, 80) ?? current.country,
    currency: isAsset(input.currency) ? input.currency : current.currency,
    description: optionalText(input.description, 280) ?? current.description,
    logoUrl: optionalText(input.logoUrl, 500_000) ?? current.logo_url,
    website: optionalText(input.website, 160) ?? current.website,
  });
  const supabase = accountDb();
  await supabase
    .from(accountTables.businessProfiles)
    .update({
      address_line: optionalText(input.addressLine, 160) ?? current.address_line,
      industry: optionalText(input.industry, 80) ?? current.industry,
      phone: optionalText(input.phone, 40) ?? current.phone,
      updated_at: nowIso(),
    })
    .eq("wallet_address", actorWallet);
  return loadBusinessProfile(actorWallet) ?? next;
}

function moneyOrZero(value: unknown) {
  if (value == null || value === "") return parseMoney("0");
  return parseMoney(value);
}

function totalsFromItems(items: InvoiceItemInput[]) {
  if (items.length === 0) {
    throw accountErrors.invalid("Add at least one invoice item.");
  }
  const computedItems = items.map((item) => {
    const description = item.description.trim();
    if (!description) throw accountErrors.invalid("Each item needs a description.");
    const quantity = moneyNumber(parseMoney(item.quantity || "1"));
    const unitPrice = moneyNumber(moneyOrZero(item.unitPrice));
    const discount = moneyNumber(moneyOrZero(item.discount));
    const tax = moneyNumber(moneyOrZero(item.tax));
    if (quantity <= 0) throw accountErrors.invalid("Quantity must be greater than zero.");
    const line = quantity * unitPrice;
    if (discount > line + 0.0000001) {
      throw accountErrors.invalid("A line discount cannot exceed the line amount.");
    }
    const total = Math.max(0, line - discount + tax);
    return {
      description: description.slice(0, 160),
      discount: roundMoney(discount),
      quantity: roundMoney(quantity),
      tax: roundMoney(tax),
      total: roundMoney(total),
      unit_price: roundMoney(unitPrice),
    };
  });
  const subtotal = computedItems.reduce(
    (sum, item) => sum + moneyNumber(item.quantity) * moneyNumber(item.unit_price),
    0,
  );
  const discount = computedItems.reduce((sum, item) => sum + moneyNumber(item.discount), 0);
  const tax = computedItems.reduce((sum, item) => sum + moneyNumber(item.tax), 0);
  const total = Math.max(0, subtotal - discount + tax);
  return {
    discount: roundMoney(discount),
    items: computedItems,
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    total: roundMoney(total),
  };
}

async function findWalletByUsername(username: string) {
  const handle = username.trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return null;
  const supabase = accountDb();
  const { data, error } = await supabase
    .from(accountTables.profiles)
    .select("wallet_address,username")
    .ilike("username", handle)
    .maybeSingle();
  if (error) {
    throw new Error(readAccountDbError(error, "Could not look up that username."));
  }
  return (data as { username: string; wallet_address: string } | null) ?? null;
}

async function allocatePublicId(invoiceNumber: string) {
  const supabase = accountDb();
  const existing = await supabase
    .from(accountTables.invoices)
    .select("id")
    .eq("public_id", invoiceNumber)
    .maybeSingle();
  if (existing.error) {
    throw new Error(readAccountDbError(existing.error, "Could not allocate an invoice link."));
  }
  if (!existing.data) return invoiceNumber;
  return `${invoiceNumber}-${randomBytes(3).toString("hex")}`;
}

async function nextInvoiceNumber(wallet: string) {
  const supabase = accountDb();
  const { data, error } = await supabase
    .from(accountTables.invoices)
    .select("invoice_number")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(readAccountDbError(error, "Could not allocate an invoice number."));
  }
  const last = (data as { invoice_number?: string } | null)?.invoice_number ?? "INV-0000";
  const match = last.match(/(\d+)$/);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `INV-${String(next).padStart(4, "0")}`;
}

async function loadInvoiceForOwner(wallet: string, invoiceId: string) {
  const supabase = accountDb();
  const invoice = await supabase
    .from(accountTables.invoices)
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoice.error) {
    throw new Error(readAccountDbError(invoice.error, "Could not load invoice."));
  }
  if (!invoice.data) throw accountErrors.invoiceNotFound();
  const row = invoice.data as InvoiceRecord;
  if (row.wallet_address !== wallet.toLowerCase()) {
    throw accountErrors.invoiceNotOwned();
  }
  const items = await supabase
    .from(accountTables.invoiceItems)
    .select("*")
    .eq("invoice_id", row.id);
  return {
    ...row,
    items: (items.data ?? []) as InvoiceItemRecord[],
  } satisfies InvoiceWithItems;
}

export async function getInvoice(input: {
  circleSocialUuid?: unknown;
  invoiceId: string;
  ownerWallet: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  return loadInvoiceForOwner(actorWallet, input.invoiceId);
}

export async function listInvoices(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
  page?: number;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const supabase = accountDb();
  const query = await supabase
    .from(accountTables.invoices)
    .select("*", { count: "exact" })
    .eq("wallet_address", actorWallet)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query.error) {
    throw new Error(readAccountDbError(query.error, "Could not load invoices."));
  }
  return {
    invoices: (query.data ?? []) as InvoiceRecord[],
    page,
    pageSize,
    total: query.count ?? 0,
  };
}

export async function invoiceSummary(wallet: string): Promise<InvoiceSummary> {
  const supabase = accountDb();
  const query = await supabase
    .from(accountTables.invoices)
    .select("status,total,amount_received")
    .eq("wallet_address", wallet.toLowerCase());
  if (query.error) {
    throw new Error(readAccountDbError(query.error, "Could not load invoice totals."));
  }
  const rows = (query.data ?? []) as Array<{
    amount_received?: string;
    status: InvoiceStatus;
    total: string;
  }>;
  return rows.reduce(
    (summary, row) => {
      const amount = moneyNumber(row.total);
      const received = moneyNumber(row.amount_received ?? "0");
      if (row.status !== "CANCELLED" && row.status !== "DRAFT") {
        summary.totalInvoiced += amount;
      }
      if (row.status === "PAID") summary.paid += amount;
      if (row.status === "PARTIALLY_PAID") {
        summary.pending += Math.max(0, amount - received);
      }
      if (row.status === "SENT" || row.status === "VIEWED" || row.status === "PENDING") {
        summary.pending += amount;
      }
      if (row.status === "OVERDUE") summary.overdue += amount;
      return summary;
    },
    { overdue: 0, paid: 0, pending: 0, totalInvoiced: 0 },
  );
}

export async function getBusinessOverview(input: {
  circleSocialUuid?: unknown;
  ownerWallet: unknown;
}) {
  const { account, actorWallet } = await requireBusinessAccount(input);
  const [profile, invoices, summary] = await Promise.all([
    loadBusinessProfile(actorWallet),
    listInvoices({ ...input, page: 1 }),
    invoiceSummary(actorWallet),
  ]);
  return {
    account,
    invoices: invoices.invoices.slice(0, 8),
    profile,
    summary,
  };
}

export async function createInvoice(input: {
  allowPartialPayment?: unknown;
  circleSocialUuid?: unknown;
  currency?: unknown;
  customerCompany?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  customerUsername?: unknown;
  customerWallet?: unknown;
  dueDate?: unknown;
  invoiceNumber?: unknown;
  issueDate?: unknown;
  items: InvoiceItemInput[];
  notes?: unknown;
  origin?: string;
  ownerWallet: unknown;
  paymentTerms?: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const totals = totalsFromItems(input.items);
  const currency = isAsset(input.currency) ? input.currency : "USDC";
  const requestedNumber =
    typeof input.invoiceNumber === "string" ? input.invoiceNumber.trim().toUpperCase() : "";
  const invoiceNumber = requestedNumber || (await nextInvoiceNumber(actorWallet));
  if (!/^INV-[A-Z0-9-]{1,24}$/.test(invoiceNumber)) {
    throw accountErrors.invalid("Invoice numbers must look like INV-1042.");
  }
  const customerUsername = optionalText(
    typeof input.customerUsername === "string"
      ? input.customerUsername.replace(/^@+/, "")
      : input.customerUsername,
    32,
  );
  if (customerUsername) {
    const found = await findWalletByUsername(customerUsername);
    if (!found) {
      throw accountErrors.invalid("That SwiftPay username was not found.");
    }
  }
  const publicId = await allocatePublicId(invoiceNumber);
  const origin = input.origin?.replace(/\/$/, "") ?? "";
  const issueDate =
    typeof input.issueDate === "string" && input.issueDate
      ? input.issueDate.slice(0, 10)
      : nowIso().slice(0, 10);
  const supabase = accountDb();
  const created = await supabase
    .from(accountTables.invoices)
    .insert({
      allow_partial_payment: Boolean(input.allowPartialPayment),
      amount_received: "0",
      created_at: nowIso(),
      currency,
      customer_company: optionalText(input.customerCompany, 80) ?? null,
      customer_email: optionalText(input.customerEmail, 160) ?? null,
      customer_name: optionalText(input.customerName, 80) ?? null,
      customer_username: customerUsername ?? null,
      customer_wallet:
        typeof input.customerWallet === "string" && isAddress(input.customerWallet)
          ? getAddress(input.customerWallet).toLowerCase()
          : null,
      discount: totals.discount,
      due_date: typeof input.dueDate === "string" && input.dueDate ? input.dueDate : null,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      notes: optionalText(input.notes, 280) ?? null,
      overpayment: "0",
      payment_link: origin ? `${origin}/invoice/${publicId}` : null,
      payment_terms: optionalText(input.paymentTerms, 280) ?? null,
      public_id: publicId,
      status: "SENT",
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      updated_at: nowIso(),
      wallet_address: actorWallet,
    })
    .select("*")
    .single();
  if (created.error) {
    throw new Error(readAccountDbError(created.error, "Could not create the invoice."));
  }
  const invoice = created.data as InvoiceRecord;
  const items = await supabase.from(accountTables.invoiceItems).insert(
    totals.items.map((item) => ({
      ...item,
      invoice_id: invoice.id,
    })),
  );
  if (items.error) {
    throw new Error(readAccountDbError(items.error, "Could not save invoice items."));
  }
  const issued = await loadInvoiceForOwner(actorWallet, invoice.id);
  await notifyInvoiceRecipient(issued);
  return issued;
}

async function notifyInvoiceRecipient(invoice: InvoiceWithItems) {
  if (!invoice.customer_username) return;
  const recipient = await findWalletByUsername(invoice.customer_username);
  if (!recipient) return;
  void createSavingsNotificationResult({
    body: `${invoice.invoice_number} for ${invoice.total} ${invoice.currency} is ready to pay${
      invoice.payment_link ? `: ${invoice.payment_link}` : "."
    }`,
    fallbackKind: "payment_request",
    kind: "payment_request",
    metadata: {
      invoiceId: invoice.id,
      publicId: invoice.public_id,
    },
    ownerWallet: recipient.wallet_address,
    title: `Invoice ${invoice.invoice_number}`,
  });
}

export async function updateInvoice(input: {
  allowPartialPayment?: unknown;
  circleSocialUuid?: unknown;
  currency?: unknown;
  customerCompany?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  customerUsername?: unknown;
  dueDate?: unknown;
  invoiceId: string;
  issueDate?: unknown;
  items?: InvoiceItemInput[];
  notes?: unknown;
  ownerWallet: unknown;
  paymentTerms?: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const current = await loadInvoiceForOwner(actorWallet, input.invoiceId);
  if (current.status !== "DRAFT") {
    throw accountErrors.invalidInvoiceStatus("Only draft invoices can be edited.");
  }
  const items = input.items?.length
    ? input.items
    : current.items.map((item) => ({
        description: item.description,
        discount: item.discount,
        quantity: item.quantity,
        tax: item.tax,
        unitPrice: item.unit_price,
      }));
  const totals = totalsFromItems(items);
  const customerUsername =
    optionalText(
      typeof input.customerUsername === "string"
        ? input.customerUsername.replace(/^@+/, "")
        : input.customerUsername,
      32,
    ) ?? current.customer_username;
  if (customerUsername) {
    const found = await findWalletByUsername(customerUsername);
    if (!found) {
      throw accountErrors.invalid("That SwiftPay username was not found.");
    }
  }
  const supabase = accountDb();
  await supabase.from(accountTables.invoiceItems).delete().eq("invoice_id", current.id);
  await supabase.from(accountTables.invoiceItems).insert(
    totals.items.map((item) => ({ ...item, invoice_id: current.id })),
  );
  const mutation = await supabase
    .from(accountTables.invoices)
    .update({
      allow_partial_payment:
        typeof input.allowPartialPayment === "boolean"
          ? input.allowPartialPayment
          : current.allow_partial_payment,
      currency: isAsset(input.currency) ? input.currency : current.currency,
      customer_company: optionalText(input.customerCompany, 80) ?? current.customer_company,
      customer_email: optionalText(input.customerEmail, 160) ?? current.customer_email,
      customer_name: optionalText(input.customerName, 80) ?? current.customer_name,
      customer_username: customerUsername ?? null,
      discount: totals.discount,
      due_date: typeof input.dueDate === "string" ? input.dueDate || null : current.due_date,
      issue_date:
        typeof input.issueDate === "string" && input.issueDate
          ? input.issueDate.slice(0, 10)
          : current.issue_date,
      notes: optionalText(input.notes, 280) ?? current.notes,
      payment_terms: optionalText(input.paymentTerms, 280) ?? current.payment_terms,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      updated_at: nowIso(),
    })
    .eq("id", current.id)
    .eq("wallet_address", actorWallet);
  if (mutation.error) {
    throw new Error(readAccountDbError(mutation.error, "Could not update the invoice."));
  }
  return loadInvoiceForOwner(actorWallet, current.id);
}

export async function sendInvoice(input: {
  circleSocialUuid?: unknown;
  invoiceId: string;
  origin?: string;
  ownerWallet: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const current = await loadInvoiceForOwner(actorWallet, input.invoiceId);
  if (current.status !== "DRAFT" && current.status !== "CANCELLED") {
    throw accountErrors.invalidInvoiceStatus("This invoice has already been sent.");
  }
  const origin = input.origin?.replace(/\/$/, "") ?? "";
  const supabase = accountDb();
  const mutation = await supabase
    .from(accountTables.invoices)
    .update({
      payment_link: origin ? `${origin}/invoice/${current.public_id}` : current.payment_link,
      status: "SENT",
      updated_at: nowIso(),
    })
    .eq("id", current.id)
    .eq("wallet_address", actorWallet);
  if (mutation.error) {
    throw new Error(readAccountDbError(mutation.error, "Could not send the invoice."));
  }
  const sent = await loadInvoiceForOwner(actorWallet, current.id);
  await notifyInvoiceRecipient(sent);
  return sent;
}

export async function cancelInvoice(input: {
  circleSocialUuid?: unknown;
  invoiceId: string;
  ownerWallet: unknown;
}) {
  const { actorWallet } = await requireBusinessAccount(input);
  const current = await loadInvoiceForOwner(actorWallet, input.invoiceId);
  if (current.status === "PAID") throw accountErrors.invoiceAlreadyPaid();
  if (current.status === "CANCELLED") return current;
  const supabase = accountDb();
  const mutation = await supabase
    .from(accountTables.invoices)
    .update({ status: "CANCELLED", updated_at: nowIso() })
    .eq("id", current.id)
    .eq("wallet_address", actorWallet);
  if (mutation.error) {
    throw new Error(readAccountDbError(mutation.error, "Could not cancel the invoice."));
  }
  return loadInvoiceForOwner(actorWallet, current.id);
}

export async function getPublicInvoice(publicId: string, options?: { markViewed?: boolean }) {
  const supabase = accountDb();
  const decodedId = decodeURIComponent(publicId);
  let invoice = await supabase
    .from(accountTables.invoices)
    .select("*")
    .eq("public_id", decodedId)
    .maybeSingle();
  if (invoice.error) {
    throw new Error(readAccountDbError(invoice.error, "Could not load invoice."));
  }
  if (!invoice.data && /^INV-[A-Z0-9-]+$/i.test(decodedId)) {
    const byNumber = await supabase
      .from(accountTables.invoices)
      .select("*")
      .ilike("invoice_number", decodedId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byNumber.error) {
      throw new Error(readAccountDbError(byNumber.error, "Could not load invoice."));
    }
    invoice = byNumber;
  }
  if (!invoice.data) throw accountErrors.invoiceNotFound();
  const row = invoice.data as InvoiceRecord;
  const [items, profile, account] = await Promise.all([
    supabase.from(accountTables.invoiceItems).select("*").eq("invoice_id", row.id),
    loadBusinessProfile(row.wallet_address),
    loadAccount(row.wallet_address),
  ]);
  if (options?.markViewed && (row.status === "DRAFT" || row.status === "SENT")) {
    await supabase
      .from(accountTables.invoices)
      .update({ status: "VIEWED", updated_at: nowIso() })
      .eq("id", row.id)
      .in("status", ["DRAFT", "SENT"]);
    void createSavingsNotificationResult({
      body: `Invoice ${row.invoice_number} was viewed.`,
      fallbackKind: "payment_request",
      kind: "payment_request",
      metadata: { invoiceId: row.id, publicId },
      ownerWallet: row.wallet_address,
      title: "Your invoice was viewed",
    });
  }
  return {
    business: {
      description: profile?.description ?? null,
      logoUrl: profile?.logo_url ?? null,
      name: profile?.business_name ?? account?.username ?? "Business",
      username: account?.username ?? null,
      website: profile?.website ?? null,
    },
    destinationWallet: row.wallet_address,
    invoice: {
      ...row,
      customer_email: null,
      items: (items.data ?? []) as InvoiceItemRecord[],
      status:
        options?.markViewed && (row.status === "SENT" || row.status === "DRAFT")
          ? "VIEWED"
          : row.status,
    },
  };
}

export async function confirmInvoicePayment(input: {
  amount: string;
  asset: unknown;
  publicId: string;
  txHash: string;
}) {
  const publicInvoice = await getPublicInvoice(input.publicId, { markViewed: false });
  const invoice = publicInvoice.invoice as InvoiceRecord & { items: InvoiceItemRecord[] };
  const txHash = input.txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    throw accountErrors.invalidPayment("Enter a valid transaction hash.");
  }
  const supabase = accountDb();
  const existingTx = await supabase
    .from(accountTables.invoicePayments)
    .select("id,invoice_id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (existingTx.data) {
    if ((existingTx.data as { invoice_id: string }).invoice_id === invoice.id) {
      return getPublicInvoice(input.publicId, { markViewed: false });
    }
    throw accountErrors.invalidPayment("This transaction was already applied.");
  }
  if (invoice.status === "PAID") throw accountErrors.invoiceAlreadyPaid();
  if (invoice.status === "CANCELLED") {
    throw accountErrors.invalidInvoiceStatus("This invoice was cancelled.");
  }
  if (!isAsset(input.asset) || input.asset !== invoice.currency) {
    throw accountErrors.invalidPayment("Pay with the invoice asset.");
  }
  const paid = moneyNumber(parseMoney(input.amount));
  if (paid <= 0) {
    throw accountErrors.invalidPayment("Payment amount must be greater than zero.");
  }
  const due = moneyNumber(invoice.total);
  const alreadyReceived = moneyNumber(invoice.amount_received ?? "0");
  const remaining = Math.max(0, due - alreadyReceived);
  const allowPartial = Boolean(invoice.allow_partial_payment);
  if (paid + 0.000001 < remaining && !allowPartial) {
    throw accountErrors.invalidPayment(
      "This invoice does not accept partial payments. Pay the remaining balance.",
    );
  }

  const payment = await supabase.from(accountTables.invoicePayments).insert({
    amount: roundMoney(paid),
    asset: input.asset,
    created_at: nowIso(),
    invoice_id: invoice.id,
    paid_at: nowIso(),
    status: "CONFIRMED",
    tx_hash: txHash,
  });
  if (payment.error) {
    if (payment.error.code === "23505") {
      return getPublicInvoice(input.publicId, { markViewed: false });
    }
    throw new Error(readAccountDbError(payment.error, "Could not record the payment."));
  }

  const recorded = await supabase
    .from(accountTables.invoicePayments)
    .select("amount")
    .eq("invoice_id", invoice.id);
  if (recorded.error) {
    throw new Error(readAccountDbError(recorded.error, "Could not load invoice payments."));
  }
  const received = ((recorded.data ?? []) as Array<{ amount: string }>).reduce(
    (sum, row) => sum + moneyNumber(row.amount),
    0,
  );
  const overpayment = Math.max(0, received - due);
  const nextStatus: InvoiceStatus =
    received + 0.000001 >= due ? "PAID" : "PARTIALLY_PAID";
  const paidAt = nextStatus === "PAID" ? nowIso() : invoice.paid_at;

  const totalsUpdate = await supabase
    .from(accountTables.invoices)
    .update({
      amount_received: roundMoney(received),
      overpayment: roundMoney(overpayment),
      updated_at: nowIso(),
    })
    .eq("id", invoice.id)
    .neq("status", "CANCELLED");
  if (totalsUpdate.error) {
    throw new Error(readAccountDbError(totalsUpdate.error, "Could not update invoice totals."));
  }
  if (nextStatus === "PAID") {
    const paidUpdate = await supabase
      .from(accountTables.invoices)
      .update({
        paid_at: paidAt,
        status: "PAID",
        updated_at: nowIso(),
      })
      .eq("id", invoice.id)
      .neq("status", "PAID")
      .neq("status", "CANCELLED");
    if (paidUpdate.error) {
      throw new Error(readAccountDbError(paidUpdate.error, "Could not mark the invoice paid."));
    }
  } else {
    const partialUpdate = await supabase
      .from(accountTables.invoices)
      .update({
        status: "PARTIALLY_PAID",
        updated_at: nowIso(),
      })
      .eq("id", invoice.id)
      .in("status", ["DRAFT", "SENT", "VIEWED", "PENDING", "PARTIALLY_PAID", "OVERDUE"]);
    if (partialUpdate.error) {
      throw new Error(readAccountDbError(partialUpdate.error, "Could not record the partial payment."));
    }
  }

  const title =
    nextStatus === "PAID" && overpayment > 0
      ? `Invoice ${invoice.invoice_number} paid with overpayment`
      : nextStatus === "PAID"
        ? `Invoice ${invoice.invoice_number} has been paid`
        : `Partial payment on ${invoice.invoice_number}`;
  const body =
    nextStatus === "PAID" && overpayment > 0
      ? `Received ${roundMoney(received)} ${invoice.currency} against ${invoice.total}. Overpayment ${roundMoney(overpayment)}.`
      : nextStatus === "PAID"
        ? `Invoice ${invoice.invoice_number} has been paid.`
        : `Received ${roundMoney(paid)} ${invoice.currency}. ${roundMoney(Math.max(0, due - received))} remaining.`;
  void createSavingsNotificationResult({
    body,
    fallbackKind: "payment_received",
    kind: "payment_received",
    metadata: {
      amountReceived: roundMoney(received),
      invoiceId: invoice.id,
      invoiceTotal: invoice.total,
      overpayment: roundMoney(overpayment),
      txHash,
    },
    ownerWallet: publicInvoice.destinationWallet,
    relatedTxHash: txHash,
    title,
  });
  return getPublicInvoice(input.publicId, { markViewed: false });
}

export function profileCompletion(profile: BusinessAccountProfile | null) {
  if (!profile) return { missing: ["profile"], percent: 0 };
  const checks = [
    ["logo", profile.logo_url],
    ["website", profile.website],
    ["description", profile.description],
  ] as const;
  const missing = checks.filter(([, value]) => !value).map(([key]) => key);
  const percent = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { missing, percent };
}
