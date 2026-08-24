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
      resolvedUrl: "http://media.test/video.mkv",
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
      resolvedUrl: "http://media.test/video.mp4",
      upstreamContentType: "Video/MP4; charset=binary",
      contentType: "video/mp4",
      contentLength: "123",
      acceptRanges: "bytes"
    }
  );
});

test("answers HEAD requests from prepared session media resource", async () => {
  const fetchCalls = [];
  const strategy = new DirectDeliveryStrategy(
    {},
    {
      fetch: async (url, options) => {
        fetchCalls.push({ url, options });
        return {
          status: 200,
          headers: new Map()
        };
      }
    }
  );
  const response = createFakeResponse();

  await strategy.handleRequest({
    session: {
      id: "session-1",
      source: {
        url: "http://media.test/source"
      },
      mediaResource: {
        contentType: "video/mp4",
        contentLength: "123",
        acceptRanges: "bytes"
      }
    },
    request: {
      method: "HEAD",
      headers: {}
    },
    response
  });

  assert.deepEqual(fetchCalls, []);
  assert.equal(response.statusCode, 200);
  assert.equal(response.ended, true);
  assert.deepEqual(response.headers, {
    "content-type": "video/mp4",
    "content-length": "123",
    "accept-ranges": "bytes",
    "contentfeatures.dlna.org":
      "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000",
    "transfermode.dlna.org": "Interactive",
    connection: "close"
  });
});

function createFakeResponse() {
  return {
    statusCode: undefined,
    headers: {},
    ended: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end() {
      this.ended = true;
    }
  };
}
