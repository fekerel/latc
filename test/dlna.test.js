import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultDlnaFeatures,
  createHttpDlnaFeatures
} from "../src/common/dlna.js";

const SEEKABLE_HTTP_DLNA_FEATURES =
  "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000";
const NON_SEEKABLE_HTTP_DLNA_FEATURES =
  "DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01500000000000000000000000000000";

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

test("creates seekable and non-seekable HTTP DLNA features", () => {
  assert.equal(
    createHttpDlnaFeatures({
      contentType: "video/mp4",
      seekable: true
    }),
    SEEKABLE_HTTP_DLNA_FEATURES
  );
  assert.equal(
    createHttpDlnaFeatures({
      contentType: "video/mp4",
      seekable: false
    }),
    NON_SEEKABLE_HTTP_DLNA_FEATURES
  );
  assert.equal(
    createHttpDlnaFeatures({
      contentType: "application/octet-stream",
      seekable: true
    }),
    "*"
  );
});
