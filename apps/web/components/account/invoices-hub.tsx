"use client";

import {
  Copy,
  Eye,
  Link2,
  Loader2,
  Mail,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InvoiceDocument } from "@/components/account/invoice-document";
import { useT } from "@/components/locale-provider";
import { useAccountContext } from "@/components/account/account-provider";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StyledSelect } from "@/components/ui/styled-select";
import {
  cancelInvoiceClient,
  createInvoiceClient,
  emailInvoiceClient,
  fetchInvoice,
  fetchInvoices,
  sendInvoiceClient,
} from "@/lib/account/client";
import {
  formatInvoiceMoney,
  invoiceStatusLabel,
  previewInvoiceTotals,
} from "@/lib/account/invoice-preview";
import type {
  BusinessAsset,
  InvoiceItemInput,
  InvoiceRecord,
  InvoiceWithItems,
} from "@/lib/account/types";
import { cn } from "@/lib/utils";

const emptyItem = (): InvoiceItemInput => ({
  description: "",
  discount: "0",
  quantity: "1",
  tax: "0",
  unitPrice: "",
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function invoiceLink(invoice: InvoiceRecord) {
  const slug = invoice.invoice_number || invoice.public_id;
  if (typeof window === "undefined") return `/invoice/${slug}`;
  return `${window.location.origin}/invoice/${encodeURIComponent(slug)}`;
}

type InvoiceIntent = "send" | "remind" | "cancel";

/** Open invoices (still awaiting payment) can be emailed. */
const emailableInvoiceStatuses: string[] = ["SENT", "VIEWED", "PENDING", "PARTIALLY_PAID", "OVERDUE"];

export function InvoicesHub() {
  const t = useT();
  const {
    account,
    circleSocialUuid: accountSocialUuid,
    isBusiness,
    loading: accountLoading,
    ownerWallet,
    profile,
  } = useAccountContext();
  const {
    address,
    circleSocialUuid: walletSocialUuid,
  } = usePlatformWallet();

  const effectiveSocialUuid = accountSocialUuid || walletSocialUuid;
  const activeWallet = (ownerWallet || address)?.toLowerCase() ?? null;
  const isBusinessAccount = Boolean(isBusiness || account?.account_type === "BUSINESS");

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  // Numbers are automatic (INV-0001, INV-0002…); a custom one is opt-in.
  const [customNumber, setCustomNumber] = useState(false);
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<BusinessAsset>("USDC");
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerUsername, setCustomerUsername] = useState("");
  const [items, setItems] = useState<InvoiceItemInput[]>([emptyItem()]);
  const [preview, setPreview] = useState<InvoiceWithItems | null>(null);
  // Email action: an invoice without a customer email asks for one first.
  const [emailTarget, setEmailTarget] = useState<InvoiceRecord | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailingId, setEmailingId] = useState<string | null>(null);
  // What ALLIE opened the preview to do, confirmed with one button there.
  const [previewIntent, setPreviewIntent] = useState<InvoiceIntent | null>(null);
  const deepLinked = useRef(false);

  const totals = useMemo(() => previewInvoiceTotals(items), [items]);

  // ALLIE hands off here: ?new=1&customer=…&amount=… opens a filled-in
  // invoice; ?invoice=<id>&do=remind opens that invoice ready to act on.
  useEffect(() => {
    if (deepLinked.current || !activeWallet || !isBusinessAccount) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);

    if (params.get("new") === "1") {
      const amount = params.get("amount") ?? "";
      const description = params.get("description") ?? "";
      setCustomerName(params.get("customer") ?? "");
      setCustomerEmail(params.get("email") ?? "");
      setCustomerUsername(params.get("username") ?? "");
      setDueDate(params.get("due") ?? "");
      setNotes((params.get("notes") ?? "").slice(0, 280));
      if (params.get("currency") === "EURC") setCurrency("EURC");
      if (amount || description) {
        setItems([{ ...emptyItem(), description, unitPrice: amount }]);
      }
      setCreating(true);
    }

    const invoiceId = params.get("invoice");
    if (invoiceId) {
      const intent = params.get("do");
      void fetchInvoice(activeWallet, invoiceId, effectiveSocialUuid)
        .then((payload) => {
          setPreview(payload.invoice);
          setPreviewIntent(
            intent === "send" || intent === "remind" || intent === "cancel" ? intent : null,
          );
        })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Could not open that invoice."),
        );
    }

    // A refresh shouldn't reopen the form or re-offer the action.
    if (params.has("new") || invoiceId) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [activeWallet, effectiveSocialUuid, isBusinessAccount]);

  function closePreview() {
    setPreview(null);
    setPreviewIntent(null);
  }

  async function confirmPreviewIntent(invoice: InvoiceWithItems) {
    if (!activeWallet || !previewIntent) return;
    try {
      if (previewIntent === "remind") {
        if (!invoice.customer_email) {
          // The email dialog asks for an address, then sends.
          setEmailAddress("");
          setEmailTarget(invoice);
          closePreview();
          return;
        }
        await emailInvoice(invoice);
      } else if (previewIntent === "send") {
        await sendInvoiceClient(activeWallet, invoice.id, effectiveSocialUuid);
        toast.success(`${invoice.invoice_number} sent`);
      } else {
        await cancelInvoiceClient(activeWallet, invoice.id, effectiveSocialUuid);
        toast.success(`${invoice.invoice_number} cancelled`);
      }
      closePreview();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't go through.");
    }
  }

  async function load() {
    if (!activeWallet || !isBusinessAccount) {
      setLoadingInvoices(false);
      return;
    }
    setLoadingInvoices(true);
    try {
      const payload = await fetchInvoices(activeWallet, 1, effectiveSocialUuid);
      setInvoices(payload.invoices);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load invoices.");
    } finally {
      setLoadingInvoices(false);
    }
  }

  useEffect(() => {
    if (activeWallet) {
      void load();
    }
  }, [activeWallet, effectiveSocialUuid, isBusinessAccount]);

  if (accountLoading && !account) {
    return (
      <div className="section-panel flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!accountLoading && !isBusinessAccount) {
    return (
      <div className="section-panel p-8">
        <h2 className="font-heading text-2xl">{t("business.invoices")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Business accounts can create invoices. Upgrade your account to Business to start issuing invoices.
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings#account-type">Upgrade to Business</Link>
        </Button>
      </div>
    );
  }

  function resetForm() {
    setStep(0);
    setInvoiceNumber("");
    setCustomNumber(false);
    setIssueDate(todayIso());
    setDueDate("");
    setCurrency("USDC");
    setNotes("");
    setPaymentTerms("");
    setAllowPartial(false);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerUsername("");
    setItems([emptyItem()]);
  }

  async function create() {
    if (!activeWallet) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInvoiceClient(
        activeWallet,
        {
          allowPartialPayment: allowPartial,
          currency,
          customerEmail,
          customerName,
          customerUsername: customerUsername.replace(/^@+/, ""),
          dueDate,
          invoiceNumber,
          issueDate,
          items: items.filter((item) => item.description.trim() && item.unitPrice),
          notes,
          origin: window.location.origin,
          paymentTerms,
        },
        effectiveSocialUuid,
      );
      const made = created.invoice;
      const delivered = [
        made.customer_username ? `@${made.customer_username}` : null,
        made.email_delivery === "sent" ? made.customer_email : null,
      ].filter(Boolean);
      toast.success(
        delivered.length > 0
          ? `${made.invoice_number} sent to ${delivered.join(" and ")}`
          : `${made.invoice_number} is ready to share`,
      );
      // The invoice exists either way; say plainly when the email didn't go.
      if (made.customer_email && made.email_delivery && made.email_delivery !== "sent") {
        toast.warning(
          made.email_delivery === "not_configured"
            ? "Invoice emails aren't set up yet, so it wasn't emailed. Share the payment link instead."
            : `The email to ${made.customer_email} didn't go through. Share the payment link instead.`,
        );
      }
      setCreating(false);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(invoice: InvoiceRecord) {
    let next = invoice;
    if (invoice.status === "DRAFT" && activeWallet) {
      try {
        const sent = await sendInvoiceClient(
          activeWallet,
          invoice.id,
          effectiveSocialUuid,
        );
        next = sent.invoice;
        await load();
      } catch {
        // Public invoice pages can still open drafts.
      }
    }
    await navigator.clipboard.writeText(invoiceLink(next));
    toast.success("Invoice link copied");
  }

  async function emailInvoice(invoice: InvoiceRecord, address?: string) {
    if (!activeWallet) return;
    setEmailingId(invoice.id);
    try {
      const sent = await emailInvoiceClient(
        activeWallet,
        invoice.id,
        address,
        effectiveSocialUuid,
      );
      toast.success(`${invoice.invoice_number} emailed to ${sent.invoice.customer_email}`);
      setEmailTarget(null);
      setEmailAddress("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The invoice could not be emailed.");
    } finally {
      setEmailingId(null);
    }
  }

  async function shareInvoice(invoice: InvoiceRecord) {
    const url = invoiceLink(invoice);
    if (navigator.share) {
      await navigator.share({
        text: `Invoice ${invoice.invoice_number}`,
        title: invoice.invoice_number,
        url,
      });
      return;
    }
    await copyLink(invoice);
  }

  const canContinueItems = items.some(
    (item) => item.description.trim() && Number(item.unitPrice) > 0,
  );

  return (
    <div className="space-y-6">
      {/* The page frame carries the "Invoices" heading. */}
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Create invoice
        </Button>
      </div>

      {error && !creating ? (
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <span>{error}</span>
          <button
            className="text-xs font-semibold hover:underline"
            onClick={() => setError(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {creating ? (
        <section className="section-panel space-y-6 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-xl">{t("business.newInvoice")}</h3>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Step {step + 1} of 4
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["Details", "Customer", "Items", "Review"].map((label, index) => (
              <div
                className={cn(
                  "rounded-full px-2 py-1 text-center text-[11px] font-semibold",
                  index === step
                    ? "bg-primary text-primary-foreground"
                    : index < step
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
                key={label}
              >
                {label}
              </div>
            ))}
          </div>

          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="text-sm font-medium">
                <span className="flex items-center justify-between gap-2">
                  Invoice number
                  <button
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      setCustomNumber((value) => !value);
                      setInvoiceNumber("");
                    }}
                    type="button"
                  >
                    {customNumber ? "Use automatic" : "Use a custom number"}
                  </button>
                </span>
                {customNumber ? (
                  <Input
                    aria-label="Custom invoice number"
                    className="mt-2 h-11"
                    onChange={(event) => setInvoiceNumber(event.target.value.toUpperCase())}
                    placeholder="e.g. INV-2026-001"
                    value={invoiceNumber}
                  />
                ) : (
                  <p className="mt-2 flex h-11 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
                    Automatic · assigned in sequence when you create it
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Currency</span>
                <StyledSelect
                  ariaLabel="Invoice currency"
                  onChange={(val) => setCurrency(val as BusinessAsset)}
                  options={[
                    { label: "USDC", value: "USDC" },
                    { label: "EURC", value: "EURC" },
                  ]}
                  triggerClassName="h-11"
                  value={currency}
                />
              </div>
              <label className="text-sm font-medium">
                Issue date
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setIssueDate(event.target.value)}
                  type="date"
                  value={issueDate}
                />
              </label>
              <label className="text-sm font-medium">
                Due date
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setDueDate(event.target.value)}
                  type="date"
                  value={dueDate}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium">
                Payment terms
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setPaymentTerms(event.target.value)}
                  placeholder="Due on receipt"
                  value={paymentTerms}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium">
                Notes
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  onChange={(event) => setNotes(event.target.value.slice(0, 280))}
                  value={notes}
                />
              </label>
              <label className="sm:col-span-2 flex items-start gap-2 text-sm">
                <input
                  checked={allowPartial}
                  onChange={(event) => setAllowPartial(event.target.checked)}
                  type="checkbox"
                />
                Allow partial payments. Underpayments stay partially paid instead of being rejected.
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-medium">
                Customer / business name
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Northwind Ltd"
                  value={customerName}
                />
              </label>
              <label className="text-sm font-medium">
                Customer email
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="billing@example.com"
                  type="email"
                  value={customerEmail}
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  The invoice is emailed here with its payment link when you create it.
                </span>
              </label>
              <label className="text-sm font-medium">
                SwiftPay username
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setCustomerUsername(event.target.value)}
                  placeholder="@optional"
                  value={customerUsername}
                />
              </label>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Username is optional. If filled, sending the invoice also delivers it to that account’s notifications.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-12"
                  key={index}
                >
                  <label className="sm:col-span-12 text-sm font-medium">
                    Description
                    <Input
                      className="mt-2 h-11"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, description: event.target.value }
                              : row,
                          ),
                        )
                      }
                      value={item.description}
                    />
                  </label>
                  <label className="sm:col-span-3 text-sm font-medium">
                    Qty
                    <Input
                      className="mt-2 h-11"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, quantity: event.target.value }
                              : row,
                          ),
                        )
                      }
                      value={item.quantity}
                    />
                  </label>
                  <label className="sm:col-span-3 text-sm font-medium">
                    Unit price
                    <Input
                      className="mt-2 h-11"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, unitPrice: event.target.value }
                              : row,
                          ),
                        )
                      }
                      value={item.unitPrice}
                    />
                  </label>
                  <label className="sm:col-span-3 text-sm font-medium">
                    Discount
                    <Input
                      className="mt-2 h-11"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, discount: event.target.value }
                              : row,
                          ),
                        )
                      }
                      value={item.discount}
                    />
                  </label>
                  <label className="sm:col-span-3 text-sm font-medium">
                    Tax
                    <Input
                      className="mt-2 h-11"
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, tax: event.target.value }
                              : row,
                          ),
                        )
                      }
                      value={item.tax}
                    />
                  </label>
                  {items.length > 1 ? (
                    <button
                      className="sm:col-span-12 inline-flex items-center gap-1 text-xs text-destructive"
                      onClick={() =>
                        setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove item
                    </button>
                  ) : null}
                </div>
              ))}
              <Button onClick={() => setItems((current) => [...current, emptyItem()])} variant="outline">
                <Plus className="h-4 w-4" />
                Add item
              </Button>
              <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatInvoiceMoney(totals.subtotal, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>{formatInvoiceMoney(totals.discount, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{formatInvoiceMoney(totals.tax, currency)}</span>
                </div>
                <div className="flex justify-between font-heading text-lg">
                  <span>Total</span>
                  <span>{formatInvoiceMoney(totals.total, currency)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Totals shown here are a preview. SwiftPay recalculates the final values on the server.
                </p>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <InvoiceDocument
              invoice={{
                businessDescription: profile?.description,
                businessLogoUrl: profile?.logo_url,
                businessName: profile?.business_name || "Business",
                businessUsername: account?.username,
                currency,
                customerEmail,
                customerName,
                customerUsername: customerUsername.replace(/^@+/, "") || null,
                discount: String(totals.discount),
                dueDate,
                invoiceNumber: invoiceNumber || "INV-auto",
                issueDate,
                items: items
                  .filter((item) => item.description.trim())
                  .map((item, index) => ({
                    description: item.description,
                    discount: item.discount || "0",
                    id: String(index),
                    quantity: item.quantity || "1",
                    tax: item.tax || "0",
                    total: String(
                      Math.max(
                        0,
                        Number(item.quantity || "1") * Number(item.unitPrice || "0") -
                          Number(item.discount || "0") +
                          Number(item.tax || "0"),
                      ),
                    ),
                    unit_price: item.unitPrice || "0",
                  })),
                notes,
                paymentTerms,
                status: "DRAFT",
                subtotal: String(totals.subtotal),
                tax: String(totals.tax),
                total: String(totals.total),
              }}
            />
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              onClick={() => {
                if (step === 0) {
                  setCreating(false);
                  return;
                }
                setStep((value) => value - 1);
              }}
              variant="outline"
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 3 ? (
              <Button
                disabled={step === 2 && !canContinueItems}
                onClick={() => setStep((value) => value + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button disabled={busy || !canContinueItems} onClick={() => void create()}>
                Create invoice
              </Button>
            )}
          </div>
        </section>
      ) : null}

      <section className="section-panel p-5">
        {loadingInvoices && invoices.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading invoices…
          </div>
        ) : invoices.length === 0 ? (
          <div>
            <p className="font-medium">Create your first invoice</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Send a polished payment request. Customers can pay from the public invoice page without a Business account.
            </p>
          </div>
        ) : (
          <div className="max-h-[30rem] overflow-auto rounded-lg">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground shadow-sm">
                <tr className="border-b border-border">
                  <th className="py-2.5 px-3">Invoice</th>
                  <th className="px-3">Customer</th>
                  <th className="px-3">Amount</th>
                  <th className="px-3">Status</th>
                  <th className="px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-t border-border hover:bg-muted/30 transition-colors" key={invoice.id}>
                    <td className="py-3 px-3 font-medium">
                      <a
                        className="underline-offset-2 hover:underline"
                        href={invoiceLink(invoice)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {invoice.invoice_number}
                      </a>
                    </td>
                    <td className="px-3">
                      <div>{invoice.customer_name || "—"}</div>
                      {invoice.customer_username ? (
                        <div className="text-xs text-muted-foreground">
                          @{invoice.customer_username}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3">{formatInvoiceMoney(invoice.total, invoice.currency)}</td>
                    <td className="capitalize px-3">
                      {invoiceStatusLabel(invoice.status, invoice.overpayment)}
                    </td>
                    <td className="px-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors"
                          onClick={() => void copyLink(invoice)}
                          title="Copy payment link"
                          aria-label="Copy payment link"
                          type="button"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Share"
                          className="invoice-row-action"
                          onClick={() => void shareInvoice(invoice)}
                          title="Share"
                          type="button"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span className="invoice-row-action-label">Share</span>
                        </button>
                        {activeWallet ? (
                          <button
                            aria-label="Preview"
                            className="invoice-row-action"
                            title="Preview"
                            onClick={() =>
                              void fetchInvoice(
                                activeWallet,
                                invoice.id,
                                effectiveSocialUuid,
                              )
                                .then((payload) => setPreview(payload.invoice))
                                .catch((err: unknown) =>
                                  setError(
                                    err instanceof Error ? err.message : "Could not preview.",
                                  ),
                                )
                            }
                            type="button"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="invoice-row-action-label">Preview</span>
                          </button>
                        ) : null}
                        {emailableInvoiceStatuses.includes(invoice.status) && activeWallet ? (
                          <button
                            aria-label={
                              invoice.customer_email ? `Email to ${invoice.customer_email}` : "Email"
                            }
                            className="invoice-row-action"
                            disabled={emailingId === invoice.id}
                            onClick={() => {
                              if (invoice.customer_email) {
                                void emailInvoice(invoice);
                              } else {
                                setEmailAddress("");
                                setEmailTarget(invoice);
                              }
                            }}
                            title={
                              invoice.customer_email
                                ? `Email to ${invoice.customer_email}`
                                : "Email this invoice"
                            }
                            type="button"
                          >
                            {emailingId === invoice.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                            <span className="invoice-row-action-label">Email</span>
                          </button>
                        ) : null}
                        {invoice.status === "DRAFT" && activeWallet ? (
                          <button
                            className="inline-flex items-center gap-1 text-xs font-semibold"
                            onClick={() =>
                              void sendInvoiceClient(
                                activeWallet,
                                invoice.id,
                                effectiveSocialUuid,
                              )
                                .then(async () => {
                                  toast.success(
                                    invoice.customer_username
                                      ? `Invoice sent to @${invoice.customer_username}`
                                      : "Invoice sent",
                                  );
                                  await load();
                                })
                                .catch((err: unknown) =>
                                  setError(err instanceof Error ? err.message : "Could not send."),
                                )
                            }
                            type="button"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Send
                          </button>
                        ) : null}
                        {invoice.status !== "PAID" &&
                        invoice.status !== "CANCELLED" &&
                        activeWallet ? (
                          <button
                            className="text-xs text-destructive"
                            onClick={() =>
                              void cancelInvoiceClient(
                                activeWallet,
                                invoice.id,
                                effectiveSocialUuid,
                              ).then(load)
                            }
                            type="button"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setEmailTarget(null);
        }}
        open={Boolean(emailTarget)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {emailTarget?.invoice_number}</DialogTitle>
            <DialogDescription>
              This invoice has no customer email yet. It&rsquo;s saved on the invoice and the
              invoice is sent there with its payment link.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (emailTarget) void emailInvoice(emailTarget, emailAddress.trim());
            }}
          >
            <Input
              aria-label="Customer email"
              autoFocus
              className="h-11"
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder="billing@example.com"
              required
              type="email"
              value={emailAddress}
            />
            <DialogFooter className="mt-4">
              <Button onClick={() => setEmailTarget(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={!emailAddress.trim() || emailingId !== null} type="submit">
                {emailingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {preview ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <InvoiceDocument
              invoice={{
                amountReceived: preview.amount_received,
                businessDescription: profile?.description,
                businessLogoUrl: profile?.logo_url,
                businessName: profile?.business_name || "Business",
                businessUsername: account?.username,
                currency: preview.currency,
                customerEmail: preview.customer_email,
                customerName: preview.customer_name,
                customerUsername: preview.customer_username,
                discount: preview.discount,
                dueDate: preview.due_date,
                invoiceNumber: preview.invoice_number,
                issueDate: preview.issue_date,
                items: preview.items,
                notes: preview.notes,
                overpayment: preview.overpayment,
                paymentTerms: preview.payment_terms,
                status: preview.status,
                subtotal: preview.subtotal,
                tax: preview.tax,
                total: preview.total,
              }}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={closePreview} variant="outline">
                Close
              </Button>
              {previewIntent === "send" &&
              (preview.status === "DRAFT" || preview.status === "CANCELLED") ? (
                <Button onClick={() => void confirmPreviewIntent(preview)}>
                  <Link2 className="h-4 w-4" />
                  Send {preview.invoice_number}
                </Button>
              ) : null}
              {previewIntent === "remind" && emailableInvoiceStatuses.includes(preview.status) ? (
                <Button
                  disabled={emailingId === preview.id}
                  onClick={() => void confirmPreviewIntent(preview)}
                >
                  {emailingId === preview.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {preview.customer_email
                    ? `Email reminder to ${preview.customer_email}`
                    : "Email a reminder"}
                </Button>
              ) : null}
              {previewIntent === "cancel" &&
              preview.status !== "PAID" &&
              preview.status !== "CANCELLED" ? (
                <Button onClick={() => void confirmPreviewIntent(preview)} variant="destructive">
                  Cancel {preview.invoice_number}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
