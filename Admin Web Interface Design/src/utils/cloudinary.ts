/**
 * Cloudinary unsigned image upload (client-side) — Admin Dashboard product images.
 *
 * Config (provided): cloud=kegmu27h, unsigned preset=mcommerce_products, resource=image
 * Endpoint: https://api.cloudinary.com/v1_1/kegmu27h/image/upload
 *
 * SECURITY / LIMITATIONS (IMPORTANT):
 * - Unsigned upload presets are PUBLIC: anyone who discovers the cloud name and
 *   preset name can upload to that preset. This is NOT admin authorization.
 * - Do NOT put a Cloudinary API secret in browser/mobile client code.
 * - Restrict the preset in Cloudinary: allowed formats, max file size, folder,
 *   moderation/auto-tagging as needed.
 * - For production, prefer signed uploads (server generates a signature).
 */

export const CLOUDINARY_CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined) || 'kegmu27h';
export const CLOUDINARY_UPLOAD_PRESET = (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined) || 'mcommerce_products';
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return 'Invalid file type. Please upload a JPG, PNG, WEBP, or GIF image.';
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'File is too large. Maximum allowed size is 5 MB.';
  }
  return null;
}

export async function uploadImageToCloudinary(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('Cloudinary cloud name is not configured.');
  }

  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  // multipart/form-data upload (unsigned preset)
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // resource_type is handled by the /image/upload endpoint

  // Use XHR for upload progress (fetch has no upload progress in browsers).
  const result = await new Promise<{ secure_url?: string; error?: { message?: string } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}') as { secure_url?: string; error?: { message?: string } };
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          resolve(json);
        } else {
          reject(new Error(json.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Cloudinary returned an invalid response (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading image to Cloudinary. Check your connection and Cloudinary settings.'));
    xhr.onabort = () => reject(new Error('Image upload was cancelled.'));
    xhr.send(formData);
  });

  if (!result.secure_url) throw new Error('Cloudinary did not return a secure_url.');
  return result.secure_url;
}
