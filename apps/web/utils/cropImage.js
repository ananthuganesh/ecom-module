/**
 * Produces a cropped image blob at a fixed size (for product card).
 * @param {string} imageSrc Data URL or object URL
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop Crop rect (pixels)
 * @param {number} outputWidth Fixed output width
 * @param {number} outputHeight Fixed output height
 * @returns {Promise<Blob>}
 */
export async function getCroppedImg(imageSrc, pixelCrop, outputWidth = 600, outputHeight = 800) {
  const sourceBlob = await (await fetch(imageSrc)).blob();
  const image = await createImageBitmap(sourceBlob);

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

  image.close();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.9
    );
  });
}
