export function normalizeContentType(contentType) {
  return contentType?.split(";")[0].trim().toLowerCase();
}

export function isVideoContentType(contentType) {
  return normalizeContentType(contentType)?.startsWith("video/") ?? false;
}
