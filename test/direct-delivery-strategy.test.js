import assert from "node:assert/strict";
import { Writable } from "node:stream";
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
  const subtitleText = [
    "1",
    "00:00:01,000 --> 00:00:03,000",
    "Hello",
    ""
  ].join("\r\n");
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
          async text() {
            return subtitleText;
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
        upstreamContentType: "text/plain",
        contentType: "application/x-subrip; charset=utf-8",
        contentLength: String(Buffer.byteLength(subtitleText, "utf8")),
        language: "eng",
        shiftMs: 0
      }
    }
  );
  assert.deepEqual(fetchCalls, [
    "http://media.test/video.mp4",
    "http://media.test/subtitle.srt"
  ]);
});

test("shifts and serves prepared subtitle resources from memory", async () => {
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
            ["content-length", "123"],
            ["accept-ranges", "bytes"]
          ]),
          async text() {
            return [
              "1",
              "00:00:01,000 --> 00:00:03,000",
              "Hello",
              ""
            ].join("\n");
          }
        };
      }
    }
  );
  const mediaResource = await strategy.prepare({
    url: "http://media.test/video.mp4",
    subtitle: {
      url: "http://media.test/subtitle.srt",
      language: "eng",
      shiftMs: 1500
    }
  });
  const response = createWritableResponse();

  await strategy.handleRequest({
    session: {
      id: "session-1",
      source: {
        url: "http://media.test/source",
        subtitle: {
          url: "http://media.test/subtitle.srt"
        }
      },
      mediaResource
    },
    resourceKind: "subtitle",
    request: {
      method: "GET",
      headers: {}
    },
    response
  });

  assert.deepEqual(fetchCalls, [
    "http://media.test/video.mp4",
    "http://media.test/subtitle.srt"
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/x-subrip; charset=utf-8"
  );
  assert.equal(
    response.body.toString("utf8"),
    ["1", "00:00:02,500 --> 00:00:04,500", "Hello", ""].join("\n")
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

function createWritableResponse() {
  const chunks = [];
  const response = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });

  response.statusCode = undefined;
  response.headers = {};
  response.status = function status(statusCode) {
    this.statusCode = statusCode;
    return this;
  };
  response.setHeader = function setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  };
  Object.defineProperty(response, "body", {
    get() {
      return Buffer.concat(chunks);
    }
  });

  return response;
}
