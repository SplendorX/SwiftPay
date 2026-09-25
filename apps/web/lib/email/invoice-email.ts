// Server-only: reads RESEND_API_KEY and must never reach a browser bundle.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { InvoiceWithItems } from "@/lib/account/types";

/**
 * Emails an invoice to the customer through Resend, using the SwiftPay Resend
 * account's RESEND_API_KEY (root .env locally).
 *
 * Sends from noreply@RESEND_EMAIL_DOMAIN, or from
 * INVOICE_EMAIL_FROM when given. The domain must be verified in Resend
 * (DNS records) before mail is delivered.
 */

export type InvoiceEmailStatus = "sent" | "failed" | "not_configured";

const resendEndpoint = "https://api.resend.com/emails";

/**
 * Who invoices come from. No fallback to Resend's shared test sender: it only
 * delivers to the Resend account owner, so every real customer would bounce
 * while the setup looked configured.
 */
function sender() {
  const explicit = process.env.INVOICE_EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const domain = process.env.RESEND_EMAIL_DOMAIN?.trim();
  return domain ? `SwiftPay <noreply@${domain}>` : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: string, currency: string) {
  const amount = Number(value);
  const shown = Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 2 })
    : value;
  return `${shown} ${currency}`;
}

function longDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" });
}

/**
 * The SwiftPay wordmark ("Swift" black, "Pay" in the brand gradient), sent
 * inside the email as an inline image. Email clients strip gradient text, and
 * a linked image cannot load from a local dev server, so an attached image is
 * the only way the gradient shows everywhere.
 */
const wordmarkContentId = "swiftpay-wordmark";
let wordmarkBase64: Promise<string | null> | null = null;

function loadWordmark() {
  wordmarkBase64 ??= readFile(join(process.cwd(), "public", "brand", "swiftpay-wordmark.png"))
    .then((file) => file.toString("base64"))
    .catch(() => null);
  return wordmarkBase64;
}

/** The business's contact email, when it is a usable reply-to address. */
function replyAddress(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160 ? email : null;
}

function invoiceEmailHtml(
  invoice: InvoiceWithItems,
  businessName: string,
  hasWordmark: boolean,
  replyTo: string | null,
) {
  const e = escapeHtml;
  const due = longDate(invoice.due_date);
  const rows = invoice.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #ece8f3;color:#17111c;font-size:14px;">${e(item.description)}
            <div style="color:#776e65;font-size:12px;">${e(item.quantity)} × ${e(money(item.unit_price, invoice.currency))}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #ece8f3;color:#17111c;font-size:14px;text-align:right;white-space:nowrap;">${e(money(item.total, invoice.currency))}</td>
        </tr>`,
    )
    .join("");
  // Text fallback when the image is missing or images are off: black "Swift",
  // solid brand purple "Pay" (gradient text does not survive email clients).
  const brand = hasWordmark
    ? `<img src="cid:${wordmarkContentId}" alt="SwiftPay" width="115" height="28" style="display:block;width:115px;height:28px;border:0;">`
    : `<span style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0a0a0a;">Swift<span style="color:#5b21b6;">Pay</span></span>`;
  const pay = invoice.payment_link
    ? `<a href="${e(invoice.payment_link)}" style="display:inline-block;background:#5b21b6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px;">Pay invoice</a>
       <p style="margin:14px 0 0;color:#776e65;font-size:12px;">Pay with USDC or EURC on Arc. The link opens the invoice on SwiftPay.</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f6f4f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;padding:32px;">
        <tr><td>${brand}</td></tr>
        <tr><td style="padding-top:24px;">
          <p style="margin:0;color:#776e65;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Invoice ${e(invoice.invoice_number)}</p>
          <h1 style="margin:8px 0 4px;color:#17111c;font-size:30px;">${e(money(invoice.total, invoice.currency))}</h1>
          <p style="margin:0;color:#514941;font-size:14px;">from <strong>${e(businessName)}</strong>${due ? ` · due ${e(due)}` : ""}</p>
        </td></tr>
        <tr><td style="padding-top:24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
            <tr>
              <td style="padding:12px 0 0;color:#17111c;font-size:14px;font-weight:700;">Total</td>
              <td style="padding:12px 0 0;color:#17111c;font-size:14px;font-weight:700;text-align:right;">${e(money(invoice.total, invoice.currency))}</td>
            </tr>
          </table>
        </td></tr>
        ${invoice.notes ? `<tr><td style="padding-top:18px;color:#514941;font-size:13px;">${e(invoice.notes)}</td></tr>` : ""}
        ${pay ? `<tr><td style="padding-top:26px;">${pay}</td></tr>` : ""}
        <tr><td style="padding-top:28px;color:#9a928a;font-size:11px;">${
          replyTo
            ? `Questions about this invoice? Reply to this email to reach ${e(businessName)}.`
            : `This mailbox isn't monitored, so please don't reply. Contact ${e(businessName)} directly with questions.`
        }<br>Sent by ${e(businessName)} with SwiftPay. If you weren't expecting this invoice, you can ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function invoiceEmailText(invoice: InvoiceWithItems, businessName: string, replyTo: string | null) {
  const due = longDate(invoice.due_date);
  return [
    `Invoice ${invoice.invoice_number} from ${businessName}`,
    `Amount: ${money(invoice.total, invoice.currency)}${due ? ` · due ${due}` : ""}`,
    "",
    ...invoice.items.map((item) => `- ${item.description}: ${money(item.total, invoice.currency)}`),
    "",
    invoice.payment_link ? `Pay here: ${invoice.payment_link}` : "",
    "",
    replyTo
      ? `Questions about this invoice? Reply to this email to reach ${businessName}.`
      : `This mailbox isn't monitored. Contact ${businessName} directly with questions.`,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

/** Send the invoice to its customer email. Never throws. */
export async function sendInvoiceEmail(input: {
  businessName: string;
  invoice: InvoiceWithItems;
  /** The business's contact email: replies go there, not to the no-reply sender. */
  replyTo?: string | null;
  /** Defaults to one key per invoice (the email on create). A re-send passes its own. */
  idempotencyKey?: string;
}): Promise<InvoiceEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = input.invoice.customer_email?.trim();
  if (!to) return "failed";
  const from = sender();
  if (!apiKey || !from) return "not_configured";
  const replyTo = replyAddress(input.replyTo);

  const wordmark = await loadWordmark();

  try {
    const response = await fetch(resendEndpoint, {
      body: JSON.stringify({
        from,
        html: invoiceEmailHtml(input.invoice, input.businessName, Boolean(wordmark), replyTo),
        ...(wordmark
          ? {
              attachments: [
                {
                  content: wordmark,
                  content_id: wordmarkContentId,
                  content_type: "image/png",
                  filename: "swiftpay.png",
                },
              ],
            }
          : {}),
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        subject: `Invoice ${input.invoice.invoice_number} from ${input.businessName}: ${money(input.invoice.total, input.invoice.currency)}`,
        text: invoiceEmailText(input.invoice, input.businessName, replyTo),
        to: [to],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // A retried request must not email the customer twice.
        "Idempotency-Key": input.idempotencyKey ?? `invoice-${input.invoice.id}`,
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("[invoice-email]", response.status, (await response.text()).slice(0, 300));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.warn("[invoice-email]", error instanceof Error ? error.message : "send failed");
    return "failed";
  }
}
