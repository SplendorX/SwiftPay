const acceptedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
export const profileImageAccept = acceptedImageMimeTypes.join(",");
const maxImageUploadBytes = 5 * 1024 * 1024;
const imageCanvasSize = 384;
const maxImageDataUrlLength = 500_000;

export function validateProfileImageFile(file: File) {
  if (!acceptedImageMimeTypes.includes(file.type)) {
    return "Image must be a JPG, PNG, or WebP file.";
  }
  if (file.size > maxImageUploadBytes) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

function loadImageFromObjectUrl(objectUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be opened."));
    image.src = objectUrl;
  });
}

export async function resizeProfileImageFile(file: File) {
  const validationError = validateProfileImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const sourceSize = Math.min(sourceWidth, sourceHeight);
    if (!sourceWidth || !sourceHeight || !sourceSize) {
      throw new Error("Image could not be opened.");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image could not be processed.");
    }

    canvas.width = imageCanvasSize;
    canvas.height = imageCanvasSize;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, imageCanvasSize, imageCanvasSize);
    context.drawImage(
      image,
      (sourceWidth - sourceSize) / 2,
      (sourceHeight - sourceSize) / 2,
      sourceSize,
      sourceSize,
      0,
      0,
      imageCanvasSize,
      imageCanvasSize,
    );

    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= maxImageDataUrlLength) {
        return dataUrl;
      }
    }

    throw new Error("Image is too large. Upload a smaller file.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
