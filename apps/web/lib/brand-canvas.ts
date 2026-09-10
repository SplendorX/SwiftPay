export const swiftPayMarkSrc = "/brand/swiftpay-mark.png?v=pay-bg";

export async function loadBrandImage(src: string) {
  try {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

export function drawSwiftPayWordmark(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  fontSize: number,
  swiftFill = "#0a0a0a",
) {
  context.font = `700 ${fontSize}px Sora, Arial, sans-serif`;
  context.fillStyle = swiftFill;
  context.fillText("Swift", x, y);
  const swiftWidth = context.measureText("Swift").width;
  const gradient = context.createLinearGradient(
    x + swiftWidth,
    y - fontSize,
    x + swiftWidth + fontSize * 2.2,
    y,
  );
  gradient.addColorStop(0, "#3b82f6");
  gradient.addColorStop(0.48, "#6366f1");
  gradient.addColorStop(1, "#8b5cf6");
  context.fillStyle = gradient;
  context.fillText("Pay", x + swiftWidth, y);
}

export async function drawSwiftPayBrand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  markSize: number,
  options?: { swiftFill?: string },
) {
  const mark = await loadBrandImage(swiftPayMarkSrc);
  if (mark) {
    const radius = Math.round(markSize * 0.22);
    context.beginPath();
    context.roundRect(x, y, markSize, markSize, radius);
    context.fillStyle = "#ffffff";
    context.fill();
    context.drawImage(mark, x, y, markSize, markSize);
    mark.close();
  }
  const fontSize = Math.round(markSize * 0.42);
  drawSwiftPayWordmark(
    context,
    x + markSize + Math.round(markSize * 0.16),
    y + Math.round(markSize * 0.64),
    fontSize,
    options?.swiftFill,
  );
}
