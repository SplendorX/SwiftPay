import type { BusinessAsset, InvoiceItemInput } from "@/lib/account/types";
import { formatMoney, moneyNumber } from "@/lib/account/money";

export function previewInvoiceTotals(items: InvoiceItemInput[]) {
  const lines = items.map((item) => {
    const quantity = moneyNumber(item.quantity || "0");
    const unitPrice = moneyNumber(item.unitPrice || "0");
    const discount = moneyNumber(item.discount || "0");
    const tax = moneyNumber(item.tax || "0");
    const line = Math.max(0, quantity * unitPrice);
    const total = Math.max(0, line - discount + tax);
    return { discount, line, quantity, tax, total, unitPrice };
  });
  const subtotal = lines.reduce((sum, item) => sum + item.line, 0);
  const discount = lines.reduce((sum, item) => sum + item.discount, 0);
  const tax = lines.reduce((sum, item) => sum + item.tax, 0);
  const total = Math.max(0, subtotal - discount + tax);
  return { discount, subtotal, tax, total };
}

export function formatInvoiceMoney(value: number | string, asset: BusinessAsset) {
  return formatMoney(value, asset);
}

export function remainingInvoiceBalance(input: {
  amountReceived?: string | null;
  total: string;
}) {
  const due = moneyNumber(input.total);
  const received = moneyNumber(input.amountReceived || "0");
  return Math.max(0, due - received);
}

export function invoiceStatusLabel(status: string, overpayment?: string | null) {
  if (status === "PAID" && moneyNumber(overpayment || "0") > 0) {
    return "Paid with overpayment";
  }
  return status.toLowerCase().replace(/_/g, " ");
}
