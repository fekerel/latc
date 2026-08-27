import assert from "node:assert/strict";
import { test } from "node:test";
import { shiftSrtTimestamps } from "../src/common/subtitles/srt.js";

test("shifts SRT timestamps forward", () => {
  assert.equal(
    shiftSrtTimestamps(
      "1\n00:00:01,000 --> 00:00:03,250\nHello\n",
      1500
    ),
    "1\n00:00:02,500 --> 00:00:04,750\nHello\n"
  );
});

test("clamps negative shifted SRT timestamps to zero", () => {
  assert.equal(
    shiftSrtTimestamps(
      "1\n00:00:01,000 --> 00:00:03,250\nHello\n",
      -1500
    ),
    "1\n00:00:00,000 --> 00:00:01,750\nHello\n"
  );
});
