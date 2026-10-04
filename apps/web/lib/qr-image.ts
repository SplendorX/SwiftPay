/** Renders an on-page QR code (an <svg>) to a PNG, on white, for copying or drawing. */
export async function svgToPngBlob(svg: SVGElement, size = 512) {
  const canvas = await svgToCanvas(svg, size);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Could not export QR code."));
    }, "image/png");
  });
}

/** The QR code drawn onto a square white canvas of `size` pixels. */
export function svgToCanvas(svg: SVGElement, size = 512) {
  const xml = new XMLSerializer().serializeToString(svg);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not draw QR code."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      // Crisp modules when scaled up.
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error("Could not load QR code."));
    image.src = href;
  });
}
