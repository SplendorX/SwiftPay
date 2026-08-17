"use client";

import { AtSign, CheckCircle2, Copy, QrCode, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { formatUsernameLabel } from "@/lib/profile";
import { buildPaymentRequestUrl } from "@/lib/payment-request-url";
import { arcTestnet } from "@/lib/wagmi";

type CopiedField = "address" | "username" | "qr";

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

async function svgToPngBlob(svg: SVGElement) {
  const xml = new XMLSerializer().serializeToString(svg);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  return new Promise<Blob>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not draw QR code."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not export QR code."));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Could not load QR code."));
    image.src = href;
  });
}

export function ReceiveShareCard({
  isConnected,
  username,
  walletAddress,
}: {
  isConnected: boolean;
  username?: string | null;
  walletAddress: string;
}) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<CopiedField | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const receiveUrl = useMemo(() => {
    if (!origin || !isConnected) {
      return "";
    }

    return buildPaymentRequestUrl({
      chainId: arcTestnet.id,
      origin,
      path: "/pay",
      username: username || undefined,
      walletAddress: username ? undefined : walletAddress,
    });
  }, [isConnected, origin, username, walletAddress]);

  const qrValue =
    receiveUrl ||
    (isConnected ? `ethereum:${walletAddress}@${arcTestnet.id}` : "");

  async function markCopied(field: CopiedField) {
    setCopied(field);
    window.setTimeout(() => {
      setCopied((current) => (current === field ? null : current));
    }, 1400);
  }

  async function handleCopyAddress() {
    if (!isConnected) return;
    try {
      await copyText(walletAddress);
      await markCopied("address");
    } catch {
      setCopied(null);
    }
  }

  async function handleCopyUsername() {
    if (!username) return;
    try {
      await copyText(formatUsernameLabel(username));
      await markCopied("username");
    } catch {
      setCopied(null);
    }
  }

  async function handleCopyQr() {
    if (!qrValue) return;

    try {
      const svg = qrRef.current?.querySelector("svg");
      if (svg && typeof ClipboardItem !== "undefined") {
        const blob = await svgToPngBlob(svg);
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        await markCopied("qr");
        return;
      }
    } catch {
      // Fall back to the receive link.
    }

    try {
      await copyText(qrValue);
      await markCopied("qr");
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="surface-panel min-w-0 overflow-x-hidden p-3 sm:p-5">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Receive</p>
          <h2 className="mt-2 font-heading text-lg font-semibold tracking-normal text-ink">
            Get paid
          </h2>
        </div>
        <QrCode className="h-4 w-4 shrink-0 text-swift-600" />
      </div>

      {!isConnected ? (
        <p className="text-sm leading-6 text-muted">
          Connect a wallet to copy your address, username, or receive QR.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start">
          <div
            className="mx-auto flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5 sm:mx-0"
            ref={qrRef}
          >
            {qrValue ? (
              <LazyQRCodeSVG
                bgColor="#ffffff"
                fgColor="#160f24"
                marginSize={1}
                size={80}
                title="SwiftPay receive QR"
                value={qrValue}
              />
            ) : (
              <QrCode className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {username ? (
                  formatUsernameLabel(username)
                ) : (
                  <Link className="text-primary hover:underline" href="/settings">
                    Set username
                  </Link>
                )}
              </p>
              <button
                aria-label={
                  copied === "username" ? "Username copied" : "Copy username"
                }
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!username}
                onClick={() => void handleCopyUsername()}
                type="button"
              >
                {copied === "username" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
                {walletAddress}
              </p>
              <button
                aria-label={
                  copied === "address" ? "Address copied" : "Copy address"
                }
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => void handleCopyAddress()}
                type="button"
              >
                {copied === "address" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <button
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-swift-600 px-2 text-[11px] font-bold text-white transition hover:bg-swift-700"
              onClick={() => void handleCopyQr()}
              type="button"
            >
              {copied === "qr" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <QrCode className="h-3.5 w-3.5" />
              )}
              {copied === "qr" ? "QR copied" : "Copy QR code"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
