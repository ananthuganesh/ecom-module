import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import { randomUUID } from "crypto";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a file buffer to Cloudflare R2
 * @param {Object} file - The file object from multer (memory   Storage)
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
export const uploadToR2 = async (file) => {
  const bucketName = process.env.R2_BUCKET;
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `products/${randomUUID()}${fileExtension}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      // Cloudflare R2 doesn't use ACLs like 'public-read' by default, 
      // accessibility is usually managed via bucket settings or Worker/Custom Domain.
    },
  });

  await upload.done();

  // Construct the public URL
  // If R2_PUBLIC_URL is provided, use it. Otherwise, use a default pattern.
  const baseUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${bucketName}`;
  return `${baseUrl.replace(/\/$/, "")}/${fileName}`;
};

export default s3Client;
