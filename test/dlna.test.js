import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultDlnaFeatures } from "../src/common/dlna.js";

const SEEKABLE_HTTP_DLNA_FEATURES =
  "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000";

test("marks video resources as seekable HTTP DLNA resources", () => {
  assert.equal(
    createDefaultDlnaFeatures("video/mp4"),
    SEEKABLE_HTTP_DLNA_FEATURES
  );
  assert.equal(
    createDefaultDlnaFeatures("video/x-matroska"),
    SEEKABLE_HTTP_DLNA_FEATURES
  );
});

test("keeps unknown non-video DLNA features open-ended", () => {
  assert.equal(createDefaultDlnaFeatures("application/octet-stream"), "*");
});
