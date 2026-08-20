import assert from "node:assert/strict";
import { test } from "node:test";
import { DirectDeliveryStrategy } from "../src/playback/delivery/strategies/direct-delivery-strategy.js";

test("prepares a declared content type override while keeping upstream type", async () => {
  const strategy = new DirectDeliveryStrategy(
    {
      declaredContentTypeOverrides: {
        "video/x-matroska": "video/mp4"
      }
    },
    {
      fetch: async () => ({
        status: 200,
        headers: new Map([
          ["content-type", "video/x-matroska; charset=binary"],
          ["content-length", "123"]
        ])
      })
    }
  );

  assert.deepEqual(
    await strategy.prepare({
      url: "http://media.test/video.mkv"
    }),
    {
      upstreamUrl: "http://media.test/video.mkv",
      upstreamContentType: "video/x-matroska; charset=binary",
      contentType: "video/mp4",
      contentLength: "123",
      acceptRanges: "bytes"
    }
  );
});

test("uses normalized upstream content type when no override matches", async () => {
  const strategy = new DirectDeliveryStrategy(
    {},
    {
      fetch: async () => ({
        status: 200,
        headers: new Map([
          ["content-type", "Video/MP4; charset=binary"],
          ["content-length", "123"]
        ])
      })
    }
  );

  assert.deepEqual(
    await strategy.prepare({
      url: "http://media.test/video.mp4"
    }),
    {
      upstreamUrl: "http://media.test/video.mp4",
      upstreamContentType: "Video/MP4; charset=binary",
      contentType: "video/mp4",
      contentLength: "123",
      acceptRanges: "bytes"
    }
  );
});
