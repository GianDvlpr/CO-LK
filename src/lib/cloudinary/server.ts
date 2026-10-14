import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

let configured = false;

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
      && process.env.CLOUDINARY_API_KEY
      && process.env.CLOUDINARY_API_SECRET,
  );
}

function getClient() {
  if (!isCloudinaryConfigured()) {
    throw new Error("CLOUDINARY_NOT_CONFIGURED");
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export async function uploadProductImage(input: {
  bytes: Uint8Array;
  mimeType: string;
  companyId: string;
  publicId: string;
}) {
  const dataUri = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const result = await getClient().uploader.upload(dataUri, {
    folder: `lk-innovacion/${input.companyId}/products`,
    public_id: input.publicId,
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    overwrite: false,
    unique_filename: false,
  });
  return result as UploadApiResponse;
}

export async function destroyProductImage(publicId: string) {
  return getClient().uploader.destroy(publicId, { resource_type: "image", invalidate: true });
}
