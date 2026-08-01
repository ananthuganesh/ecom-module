/**
 * Produces a cropped image blob at a fixed size (for product card).
 * @param {string} imageSrc Data URL or object URL
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop Crop rect (pixels)
 * @param {number} outputWidth Fixed output width
 * @param {number} outputHeight Fixed output height
 * @returns {Promise<Blob>}
 */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for crop"));
    image.src = src;
  });
}

export async function getCroppedImg(
  imageSrc,
  pixelCrop,
  outputWidth = 600,
  outputHeight = 800
) {
  // Use <img> instead of fetch(blob:) — CSP connect-src often blocks blob fetches.
  const image = await loadImageElement(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d not available");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.9
    );
  });
}
