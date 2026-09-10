import { formatMoney, moneyNumber } from "@/lib/account/money";
import type { BusinessAsset, InvoiceItemRecord } from "@/lib/account/types";
import { drawSwiftPayBrand, loadBrandImage } from "@/lib/brand-canvas";

type ReceiptInput = {
  amountReceived: string;
  businessName: string;
  currency: BusinessAsset;
  customerName?: string | null;
  invoiceNumber: string;
  items: InvoiceItemRecord[];
  logoUrl?: string | null;
  overpayment?: string | null;
  paidAt?: string | null;
  total: string;
};

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export async function downloadInvoiceReceipt(input: ReceiptInput) {
  const width = 1080;
  const rowHeight = 54;
  const height = 860 + input.items.length * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Receipt could not be created.");
  }

  const cream = "#f4ebdd";
  const ink = "#17111c";
  const muted = "#776e65";
  const purple = "#5b21b6";
  const card = "#fff9f0";

  context.fillStyle = cream;
  context.fillRect(0, 0, width, height);
  context.fillStyle = purple;
  context.fillRect(0, 0, width, 18);

  roundRect(context, 64, 56, width - 128, height - 112, 36);
  context.fillStyle = card;
  context.fill();

  await drawSwiftPayBrand(context, 108, 88, 72);

  if (input.logoUrl) {
    const logo = await loadBrandImage(input.logoUrl);
    if (logo) {
      context.save();
      roundRect(context, 108, 180, 72, 72, 18);
      context.clip();
      context.drawImage(logo, 108, 180, 72, 72);
      context.restore();
    }
  }

  context.fillStyle = ink;
  context.font = "600 36px Sora, sans-serif";
  context.fillText(input.businessName.slice(0, 28), 200, 228);
  context.fillStyle = muted;
  context.font = "500 22px Manrope, sans-serif";
  context.fillText(`Invoice ${input.invoiceNumber}`, 200, 262);

  context.fillStyle = "#16a34a";
  context.font = "700 28px Sora, sans-serif";
  const paidLabel =
    moneyNumber(input.overpayment || "0") > 0 ? "PAID · OVERPAYMENT" : "PAID";
  context.fillText(paidLabel, 108, 330);

  context.fillStyle = ink;
  context.font = "700 64px Sora, sans-serif";
  context.fillText(formatMoney(input.total, input.currency), 108, 410);

  context.fillStyle = muted;
  context.font = "500 22px Manrope, sans-serif";
  context.fillText(
    input.paidAt ? `Paid ${input.paidAt.slice(0, 10)}` : "Payment confirmed",
    108,
    454,
  );
  if (input.customerName) {
    context.fillText(`Billed to ${input.customerName}`, 108, 490);
  }

  let y = 560;
  context.fillStyle = muted;
  context.font = "600 18px Manrope, sans-serif";
  context.fillText("ITEM", 108, y);
  context.fillText("TOTAL", 860, y);
  y += 24;
  context.strokeStyle = "rgba(23,17,28,0.12)";
  context.beginPath();
  context.moveTo(108, y);
  context.lineTo(972, y);
  context.stroke();
  y += 40;

  context.fillStyle = ink;
  context.font = "500 22px Manrope, sans-serif";
  for (const item of input.items) {
    context.fillText(item.description.slice(0, 42), 108, y);
    context.fillText(formatMoney(item.total, input.currency), 860, y);
    y += rowHeight;
  }

  context.fillStyle = muted;
  context.font = "500 18px Manrope, sans-serif";
  context.fillText("Receipt issued by SwiftPay", 108, height - 86);

  const link = document.createElement("a");
  link.download = `SwiftPay-${input.invoiceNumber}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
