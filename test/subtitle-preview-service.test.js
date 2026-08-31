import assert from "node:assert/strict";
import { test } from "node:test";
import { SubtitlePreviewService } from "../src/preview/subtitle-preview-service.js";

test("converts SRT subtitles to WebVTT", async () => {
  const service = new SubtitlePreviewService({
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => [
        "1",
        "00:00:01,500 --> 00:00:03,000",
        "Hello"
      ].join("\r\n")
    })
  });

  assert.equal(
    await service.prepareSubtitle({
      url: "http://media.test/subtitle.srt"
    }),
    [
      "WEBVTT",
      "",
      "1",
      "00:00:01.500 --> 00:00:03.000",
      "Hello"
    ].join("\n")
  );
});

test("keeps existing WebVTT subtitles", async () => {
  const service = new SubtitlePreviewService({
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "\r\nWEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHi"
    })
  });

  assert.equal(
    await service.prepareSubtitle({
      url: "http://media.test/subtitle.vtt"
    }),
    [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "Hi"
    ].join("\n")
  );
});

test("throws when subtitle request fails", async () => {
  const service = new SubtitlePreviewService({
    fetch: async () => ({
      ok: false,
      status: 404
    })
  });

  await assert.rejects(
    () => service.prepareSubtitle({
      url: "http://media.test/missing.srt"
    }),
    /Subtitle request failed with status 404/
  );
});
