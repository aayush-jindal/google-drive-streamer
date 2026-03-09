export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Upscale a Drive thumbnail link from its default ~220px to a larger size.
 */
export function scaleThumbnail(thumbnailLink, size = 400) {
  if (!thumbnailLink) return null;
  return thumbnailLink.replace(/=s\d+$/, `=s${size}`);
}
