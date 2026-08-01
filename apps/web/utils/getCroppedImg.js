/**
 * Returns a blob for the cropped image at a fixed output size (for product card).
 * @param {string} imageSrc - Data URL or object URL of the image
 * @param {object} pixelCrop - { x, y, width, height } from react-easy-crop
 * @param {number} outputWidth - e.g. 400
 * @param {number} outputHeight - e.g. 533 (3:4 aspect)
 * @returns {Promise<Blob>}
 */
export async function getCroppedImg(imageSrc, pixelCrop, outputWidth = 400, outputHeight = 533) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputWidth, outputHeight
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.85
    );
  });
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
