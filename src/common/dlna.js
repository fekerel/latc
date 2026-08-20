import { isVideoContentType } from "./content-type.js";

const SEEKABLE_HTTP_DLNA_FEATURES =
  "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000";

export function createDefaultDlnaFeatures(contentType) {
  if (isVideoContentType(contentType)) {
    return SEEKABLE_HTTP_DLNA_FEATURES;
  }

  return "*";
}
