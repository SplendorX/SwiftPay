"use client";

import { Download, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { InvoiceDocument } from "@/components/account/invoice-document";
import { PlatformBrand } from "@/components/brand/platform-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { fetchPublicInvoice, payPublicInvoice } from "@/lib/account/client";
import { downloadInvoiceReceipt } from "@/lib/account/invoice-receipt";
import { remainingInvoiceBalance } from "@/lib/account/invoice-preview";
import { moneyNumber, roundMoney } from "@/lib/account/money";
import { erc20Abi } from "@/lib/contracts";
import { arcTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

type PublicInvoice = Awaited<ReturnType<typeof fetchPublicInvoice>>;

export default function PublicInvoicePage() {
  const params = useParams<{ publicId: string }>();
  const publicId = params.publicId;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [payload, setPayload] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicId) return;
    void fetchPublicInvoice(publicId)
      .then((next) => {
        setPayload(next);
        const remaining = remainingInvoiceBalance({
          amountReceived: next.invoice.amount_received,
          total: next.invoice.total,
        });
        setPayAmount(roundMoney(remaining));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Invoice was not found."),
      );
  }, [publicId]);

  const remaining = useMemo(() => {
    if (!payload) return 0;
    return remainingInvoiceBalance({
      amountReceived: payload.invoice.amount_received,
      total: payload.invoice.total,
    });
  }, [payload]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <PlatformBrand />
        <h1 className="mt-4 font-heading text-3xl">Invoice not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-sm text-muted-foreground">
        Loading invoice…
      </main>
    );
  }

  const invoice = payload.invoice;
  const paid = invoice.status === "PAID";
  const cancelled = invoice.status === "CANCELLED";
  const allowPartial = Boolean(invoice.allow_partial_payment);
  const overpayment = moneyNumber(payAmount || "0") > remaining + 0.000001;
  const token = arcTokens[invoice.currency];
  const payHref = `/dashboard?to=${encodeURIComponent(payload.destinationWallet)}&amount=${encodeURIComponent(payAmount || String(remaining))}&token=${encodeURIComponent(invoice.currency)}&memo=${encodeURIComponent(invoice.invoice_number)}`;

  async function refresh() {
    if (!publicId) return;
    const next = await fetchPublicInvoice(publicId);
    setPayload(next);
    const nextRemaining = remainingInvoiceBalance({
      amountReceived: next.invoice.amount_received,
      total: next.invoice.total,
    });
    setPayAmount(roundMoney(nextRemaining));
  }

  async function pay() {
    if (!payload || !address) {
      setError("Connect a wallet to pay this invoice.");
      return;
    }
    const amount = payAmount.trim();
    const value = moneyNumber(amount);
    if (value <= 0) {
      setError("Enter a payment amount.");
      return;
    }
    if (!allowPartial && value + 0.000001 < remaining) {
      setError("This invoice does not accept partial payments.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const destination = getAddress(payload.destinationWallet);
      const units = parseUnits(amount, token.decimals);
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: token.address,
        args: [destination, units],
        chainId: arcTestnet.id,
        functionName: "transfer",
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      const confirmed = await payPublicInvoice(publicId, {
        amount,
        asset: invoice.currency,
        txHash: hash,
      });
      setPayload({
        ...payload,
        invoice: confirmed.invoice,
      });
      toast.success(
        confirmed.invoice.status === "PAID"
          ? "Payment confirmed"
          : "Partial payment recorded",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <PlatformBrand />
          <p className="mt-2 text-sm text-muted-foreground">
            Secure invoice payment
          </p>
        </div>
        <a className="text-sm font-medium text-primary" href="https://getswiftpay.xyz">
          getswiftpay.xyz
        </a>
      </div>

      <InvoiceDocument
        invoice={{
          amountReceived: invoice.amount_received,
          businessDescription: payload.business.description,
          businessLogoUrl: payload.business.logoUrl,
          businessName: payload.business.name,
          businessUsername: payload.business.username,
          currency: invoice.currency,
          customerName: invoice.customer_name,
          customerUsername: invoice.customer_username,
          discount: invoice.discount,
          dueDate: invoice.due_date,
          invoiceNumber: invoice.invoice_number,
          issueDate: invoice.issue_date,
          items: invoice.items,
          notes: invoice.notes,
          overpayment: invoice.overpayment,
          paymentTerms: invoice.payment_terms,
          status: invoice.status,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          total: invoice.total,
        }}
      />

      <section className="section-panel mt-6 space-y-4 p-5 sm:p-6">
        {paid ? (
          <>
            <p className="font-heading text-xl">Payment confirmed</p>
            <p className="text-sm text-muted-foreground">
              This invoice is marked paid. Download a SwiftPay receipt for your records.
            </p>
            {moneyNumber(invoice.overpayment || "0") > 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Amount received {invoice.amount_received} {invoice.currency} against a total of{" "}
                {invoice.total}. Overpayment {invoice.overpayment}.
              </p>
            ) : null}
            <Button
              onClick={() =>
                void downloadInvoiceReceipt({
                  amountReceived: invoice.amount_received || invoice.total,
                  businessName: payload.business.name,
                  currency: invoice.currency,
                  customerName: invoice.customer_name,
                  invoiceNumber: invoice.invoice_number,
                  items: invoice.items,
                  logoUrl: payload.business.logoUrl,
                  overpayment: invoice.overpayment,
                  paidAt: invoice.paid_at,
                  total: invoice.total,
                })
              }
            >
              <Download className="h-4 w-4" />
              Download PNG receipt
            </Button>
          </>
        ) : cancelled ? (
          <p className="text-sm text-muted-foreground">This invoice was cancelled.</p>
        ) : (
          <>
            <h2 className="font-heading text-xl">Pay invoice</h2>
            <p className="text-sm text-muted-foreground">
              You can pay with a connected wallet. A SwiftPay account is not required.
              Remaining balance {roundMoney(remaining)} {invoice.currency}.
            </p>
            {allowPartial ? (
              <label className="block text-sm font-medium">
                Amount
                <Input
                  className="mt-2 h-11"
                  onChange={(event) => setPayAmount(event.target.value)}
                  value={payAmount}
                />
              </label>
            ) : (
              <p className="text-sm font-medium">
                Amount due {roundMoney(remaining)} {invoice.currency}
              </p>
            )}
            {overpayment ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                This is an overpayment. SwiftPay will record the invoice total, amount received,
                and the overage instead of treating it as a normal exact payment.
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              {!isConnected ? (
                <WalletConnectButton fullWidth />
              ) : (
                <Button className="h-11" disabled={busy} onClick={() => void pay()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Pay invoice
                </Button>
              )}
              <Button asChild className="h-11" variant="outline">
                <a href={payHref}>Pay with SwiftPay</a>
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
