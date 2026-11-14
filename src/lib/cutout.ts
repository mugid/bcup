const ALPHA_THRESHOLD = 16;
const MAX_SAVED_EDGE = 1600;

export async function cropTransparentObject(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("The object image is empty.");

    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("Image processing is unavailable.");
    sourceContext.drawImage(bitmap, 0, 0);

    const { data } = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height);
    let left = bitmap.width;
    let top = bitmap.height;
    let right = -1;
    let bottom = -1;
    let foregroundPixels = 0;

    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (data[(y * bitmap.width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
        foregroundPixels++;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }

    if (foregroundPixels < Math.max(64, bitmap.width * bitmap.height * 0.001)) {
      throw new Error("No clear foreground object was found.");
    }
    if (foregroundPixels >= bitmap.width * bitmap.height * 0.98) {
      throw new Error("The background could not be removed from this photo.");
    }

    const objectWidth = right - left + 1;
    const objectHeight = bottom - top + 1;
    const padding = Math.max(8, Math.round(Math.max(objectWidth, objectHeight) * 0.02));
    const paddedWidth = objectWidth + padding * 2;
    const paddedHeight = objectHeight + padding * 2;
    const scale = Math.min(1, MAX_SAVED_EDGE / Math.max(paddedWidth, paddedHeight));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(paddedWidth * scale));
    output.height = Math.max(1, Math.round(paddedHeight * scale));
    const context = output.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.imageSmoothingQuality = "high";
    context.scale(output.width / paddedWidth, output.height / paddedHeight);
    context.drawImage(bitmap, padding - left, padding - top);

    return await new Promise<Blob>((resolve, reject) => {
      output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not save the object image.")), "image/png");
    });
  } finally {
    bitmap.close();
  }
}
