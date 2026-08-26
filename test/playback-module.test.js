import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackModule } from "../src/playback/index.js";

test("exposes subtitle request handling from the playback module", () => {
  const playback = createPlaybackModule({
    getPublicBaseUrl: () => "http://latc.test"
  });

  assert.equal(typeof playback.handleSubtitleRequest, "function");
  assert.equal(typeof playback.createSubtitleUrl, "function");
});
