const SEEKABLE_HTTP_DLNA_FEATURES =
  "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000";

export function normalizeContentType(contentType) {
  return contentType?.split(";")[0].trim().toLowerCase();
}

export function createDefaultDlnaFeatures(contentType) {
  if (isVideoContentType(contentType)) {
    return SEEKABLE_HTTP_DLNA_FEATURES;
  }

  return "*";
}

function isVideoContentType(contentType) {
  return normalizeContentType(contentType)?.startsWith("video/") ?? false;
}
