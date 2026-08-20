export function normalizeContentType(contentType) {
  return contentType?.split(";")[0].trim().toLowerCase();
}

export function createDefaultDlnaFeatures(contentType) {
  if (normalizeContentType(contentType) === "video/mp4") {
    return "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000";
  }

  return "*";
}
