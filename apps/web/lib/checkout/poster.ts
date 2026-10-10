import { downloadCanvas, drawSaphraBrand, loadBrandImage, roundRect } from "@/lib/brand-canvas";
import { svgToCanvas } from "@/lib/qr-image";

/**
 * A print-ready storefront poster (A-series ratio, 1240×1754 ≈ A5 at 210 dpi
 * or A4 at 150 dpi): business name, "Scan to pay", the QR and its URL.
 */
export async function downloadStorefrontPoster(input: {
  businessName: string;
  logoUrl?: string | null;
  qrSvg: SVGElement;
  url: string;
}) {
  const width = 1240;
  const height = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Poster could not be created.");

  const ink = "#17111c";
  const muted = "#5f5866";
  const purple = "#5b21b6";

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const band = context.createLinearGradient(0, 0, width, 0);
  band.addColorStop(0, "#3b82f6");
  band.addColorStop(0.48, "#6366f1");
  band.addColorStop(1, "#8b5cf6");
  context.fillStyle = band;
  context.fillRect(0, 0, width, 28);
  context.fillRect(0, height - 28, width, 28);

  context.textAlign = "center";
  let y = 150;
  if (input.logoUrl) {
    const logo = await loadBrandImage(input.logoUrl);
    if (logo) {
      const size = 140;
      context.save();
      roundRect(context, (width - size) / 2, y, size, size, 32);
      context.clip();
      context.drawImage(logo, (width - size) / 2, y, size, size);
      context.restore();
      logo.close();
      y += size + 40;
    }
  }

  context.fillStyle = ink;
  context.font = "700 84px Sora, Arial, sans-serif";
  const name = input.businessName.length > 22 ? `${input.businessName.slice(0, 21)}…` : input.businessName;
  context.fillText(name, width / 2, y + 70);
  y += 160;

  context.fillStyle = purple;
  context.font = "700 64px Sora, Arial, sans-serif";
  context.fillText("Scan to pay with SaphraONE", width / 2, y);
  y += 60;

  const qrSize = 820;
  const qrX = (width - qrSize) / 2;
  const qrY = y;
  roundRect(context, qrX - 36, qrY - 36, qrSize + 72, qrSize + 72, 48);
  context.strokeStyle = "rgba(23,17,28,0.12)";
  context.lineWidth = 4;
  context.stroke();
  const qr = await svgToCanvas(input.qrSvg, qrSize);
  context.drawImage(qr, qrX, qrY);
  y = qrY + qrSize + 110;

  context.fillStyle = muted;
  context.font = "500 40px Manrope, Arial, sans-serif";
  context.fillText("SaphraONE or any wallet on Arc", width / 2, y);
  y += 70;
  context.fillStyle = ink;
  context.font = "600 38px Manrope, Arial, sans-serif";
  context.fillText(input.url.replace(/^https?:\/\//, ""), width / 2, y);

  context.textAlign = "left";
  await drawSaphraBrand(context, (width - 330) / 2, height - 170, 88);

  downloadCanvas(canvas, `SaphraONE-poster-${input.businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
}
