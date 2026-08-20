import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isVideoContentType,
  normalizeContentType
} from "../src/common/content-type.js";

test("normalizes content types", () => {
  assert.equal(normalizeContentType("Video/MP4; charset=utf-8"), "video/mp4");
});

test("detects video content types", () => {
  assert.equal(isVideoContentType("video/x-matroska"), true);
  assert.equal(isVideoContentType("Video/MP4; charset=utf-8"), true);
  assert.equal(isVideoContentType("application/octet-stream"), false);
  assert.equal(isVideoContentType(undefined), false);
});
