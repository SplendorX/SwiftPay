"use client";

import {
  Copy,
  Eye,
  Link2,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { InvoiceDocument } from "@/components/account/invoice-document";
import { useAccountContext } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelInvoiceClient,
  createInvoiceClient,
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

export function InvoicesHub() {
  const { isBusiness, ownerWallet, profile, account } = useAccountContext();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso);
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

  const totals = useMemo(() => previewInvoiceTotals(items), [items]);

  async function load() {
    if (!ownerWallet) return;
    const payload = await fetchInvoices(ownerWallet);
    setInvoices(payload.invoices);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load invoices."),
    );
  }, [ownerWallet]);

  if (!isBusiness) {
    return (
      <div className="section-panel p-8">
        <h2 className="font-heading text-2xl">Invoices</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Business accounts can create invoices.
        </p>
      </div>
    );
  }

  function resetForm() {
    setStep(0);
    setInvoiceNumber("");
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
    if (!ownerWallet) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInvoiceClient(ownerWallet, {
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
      });
      toast.success(
        created.invoice.customer_username
          ? `${created.invoice.invoice_number} sent to @${created.invoice.customer_username}`
          : `${created.invoice.invoice_number} is ready to share`,
      );
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
    if (invoice.status === "DRAFT" && ownerWallet) {
      try {
        const sent = await sendInvoiceClient(ownerWallet, invoice.id);
        next = sent.invoice;
        await load();
      } catch {
        // Public invoice pages can still open drafts.
      }
    }
    await navigator.clipboard.writeText(invoiceLink(next));
    toast.success("Invoice link copied");
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl">Invoices</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a professional invoice, share the payment link, and track settlement.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Create invoice
        </Button>
      </div>

      {creating ? (
        <section className="section-panel space-y-6 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-xl">New invoice</h3>
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
              <label className="text-sm font-medium">
                Invoice number
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setInvoiceNumber(event.target.value.toUpperCase())}
                  placeholder="Auto, e.g. INV-1042"
                  value={invoiceNumber}
                />
              </label>
              <label className="text-sm font-medium">
                Currency
                <select
                  className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  onChange={(event) => setCurrency(event.target.value as BusinessAsset)}
                  value={currency}
                >
                  <option value="USDC">USDC</option>
                  <option value="EURC">EURC</option>
                </select>
              </label>
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
                  value={customerEmail}
                />
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
        {invoices.length === 0 ? (
          <div>
            <p className="font-medium">Create your first invoice</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Send a polished payment request. Customers can pay from the public invoice page without a Business account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-t border-border" key={invoice.id}>
                    <td className="py-3 font-medium">
                      <a
                        className="underline-offset-2 hover:underline"
                        href={invoiceLink(invoice)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {invoice.invoice_number}
                      </a>
                    </td>
                    <td>
                      <div>{invoice.customer_name || "—"}</div>
                      {invoice.customer_username ? (
                        <div className="text-xs text-muted-foreground">
                          @{invoice.customer_username}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatInvoiceMoney(invoice.total, invoice.currency)}</td>
                    <td className="capitalize">
                      {invoiceStatusLabel(invoice.status, invoice.overpayment)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                          onClick={() => void copyLink(invoice)}
                          type="button"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy payment link
                        </button>
                        <button
                          className="inline-flex items-center gap-1 text-xs font-semibold"
                          onClick={() => void shareInvoice(invoice)}
                          type="button"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Share
                        </button>
                        {ownerWallet ? (
                          <button
                            className="inline-flex items-center gap-1 text-xs font-semibold"
                            onClick={() =>
                              void fetchInvoice(ownerWallet, invoice.id)
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
                            Preview
                          </button>
                        ) : null}
                        {invoice.status === "DRAFT" && ownerWallet ? (
                          <button
                            className="inline-flex items-center gap-1 text-xs font-semibold"
                            onClick={() =>
                              void sendInvoiceClient(ownerWallet, invoice.id)
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
                        ownerWallet ? (
                          <button
                            className="text-xs text-destructive"
                            onClick={() =>
                              void cancelInvoiceClient(ownerWallet, invoice.id).then(load)
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

      {preview ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
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
            <div className="mt-3 flex justify-end">
              <Button onClick={() => setPreview(null)} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
