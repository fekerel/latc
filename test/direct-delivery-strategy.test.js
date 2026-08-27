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
          ["content-length", "123"],
          ["accept-ranges", "none"]
        ])
      })
    }
  );

  assert.deepEqual(
    await strategy.prepare({
      url: "http://media.test/video.mkv"
    }),
    {
      video: {
        resolvedUrl: "http://media.test/video.mkv",
        upstreamContentType: "video/x-matroska; charset=binary",
        contentType: "video/mp4",
        contentLength: "123",
        acceptRanges: "bytes",
        seekable: true,
        dlnaFeatures:
          "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000"
      },
      subtitle: undefined
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
          ["content-length", "123"],
          ["accept-ranges", "bytes"]
        ])
      })
    }
  );

  assert.deepEqual(
    await strategy.prepare({
      url: "http://media.test/video.mp4"
    }),
    {
      video: {
        resolvedUrl: "http://media.test/video.mp4",
        upstreamContentType: "Video/MP4; charset=binary",
        contentType: "video/mp4",
        contentLength: "123",
        acceptRanges: "bytes",
        seekable: true,
        dlnaFeatures:
          "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000"
      },
      subtitle: undefined
    }
  );
});

test("prepares a non-seekable resource when accept-ranges is missing", async () => {
  const strategy = new DirectDeliveryStrategy(
    {},
    {
      fetch: async () => ({
        status: 200,
        headers: new Map([
          ["content-type", "video/mp4"],
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
      video: {
        resolvedUrl: "http://media.test/video.mp4",
        upstreamContentType: "video/mp4",
        contentType: "video/mp4",
        contentLength: "123",
        acceptRanges: undefined,
        seekable: false,
        dlnaFeatures:
          "DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01500000000000000000000000000000"
      },
      subtitle: undefined
    }
  );
});

test("prepares a subtitle resource when a subtitle source is present", async () => {
  const fetchCalls = [];
  const strategy = new DirectDeliveryStrategy(
    {},
    {
      fetch: async (url) => {
        fetchCalls.push(url);

        return {
          status: 200,
          headers: new Map([
            ["content-type", url.endsWith(".srt") ? "text/plain" : "video/mp4"],
            ["content-length", url.endsWith(".srt") ? "42" : "123"],
            ["accept-ranges", "bytes"]
          ]),
          body: {
            async cancel() {}
          }
        };
      }
    }
  );

  assert.deepEqual(
    await strategy.prepare({
      url: "http://media.test/video.mp4",
      subtitle: {
        url: "http://media.test/subtitle.srt",
        language: "eng"
      }
    }),
    {
      video: {
        resolvedUrl: "http://media.test/video.mp4",
        upstreamContentType: "video/mp4",
        contentType: "video/mp4",
        contentLength: "123",
        acceptRanges: "bytes",
        seekable: true,
        dlnaFeatures:
          "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000"
      },
      subtitle: {
        resolvedUrl: "http://media.test/subtitle.srt",
        contentType: "application/x-subrip; charset=utf-8",
        contentLength: "42",
        language: "eng"
      }
    }
  );
  assert.deepEqual(fetchCalls, [
    "http://media.test/video.mp4",
    "http://media.test/subtitle.srt"
  ]);
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
        video: {
          contentType: "video/mp4",
          contentLength: "123",
          acceptRanges: "bytes",
          seekable: true,
          dlnaFeatures:
            "DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01500000000000000000000000000000"
        }
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

test("answers non-seekable HEAD requests with streaming DLNA headers", async () => {
  const strategy = new DirectDeliveryStrategy();
  const response = createFakeResponse();

  await strategy.handleRequest({
    session: {
      id: "session-1",
      source: {
        url: "http://media.test/source"
      },
      mediaResource: {
        video: {
          contentType: "video/mp4",
          contentLength: "123",
          acceptRanges: undefined,
          seekable: false,
          dlnaFeatures:
            "DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01500000000000000000000000000000"
        }
      }
    },
    request: {
      method: "HEAD",
      headers: {}
    },
    response
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["accept-ranges"], undefined);
  assert.equal(
    response.headers["contentfeatures.dlna.org"],
    "DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01500000000000000000000000000000"
  );
  assert.equal(response.headers["transfermode.dlna.org"], "Streaming");
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
