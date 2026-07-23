/** Downscale an image File to a JPEG data URL and uploadable Blob. */
export async function downscaleImage(
  file: File,
  maxDim = 1024,
  quality = 0.82,
): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error("image load failed"));
    candidate.src = dataUrl;
  });
  const ratio = Math.min(1, maxDim / Math.max(image.width, image.height));
  const width = Math.round(image.width * ratio);
  const height = Math.round(image.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("image conversion failed"))),
      "image/jpeg",
      quality,
    ),
  );
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality) };
}
