import assert from "node:assert/strict";
import { test } from "node:test";
import { createPreviewsApi } from "../src/http/api/previews.js";

test("returns 202 for playlists that are not streamable yet", async () => {
  const router = createPreviewsApi({
    getPlaylist() {
      return {
        ready: false,
        status: "encoding"
      };
    }
  });
  const response = await runRoute(router, {
    method: "GET",
    url: "/preview-1/clips/clip-1/playlist.m3u8"
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.headers["Retry-After"], "1");
  assert.deepEqual(response.body, {
    ready: false,
    status: "encoding"
  });
});

test("serves ready playlists as HLS manifests", async () => {
  const router = createPreviewsApi({
    getPlaylist() {
      return {
        ready: true,
        playlistText: "#EXTM3U\n"
      };
    }
  });
  const response = await runRoute(router, {
    method: "GET",
    url: "/preview-1/clips/clip-1/playlist.m3u8"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.match(response.headers["Content-Type"], /application\/vnd\.apple\.mpegurl/);
  assert.equal(response.body, "#EXTM3U\n");
});

test("serves preview subtitles as WebVTT", async () => {
  const router = createPreviewsApi({
    getSubtitle() {
      return {
        ready: true,
        vttText: "WEBVTT\n"
      };
    }
  });
  const response = await runRoute(router, {
    method: "GET",
    url: "/preview-1/subtitles/subtitle-1.vtt"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.match(response.headers["Content-Type"], /text\/vtt/);
  assert.equal(response.body, "WEBVTT\n");
});

test("serves preview segments from the service path", async () => {
  const sendFileCalls = [];
  const router = createPreviewsApi({
    async getSegment(previewId, clipId, segmentName) {
      return {
        ready: true,
        segmentPath: `Q:/tmp/${previewId}/${clipId}/${segmentName}`
      };
    }
  });

  await runRoute(router, {
    method: "GET",
    url: "/preview-1/clips/clip-1/segments/segment_000.ts",
    createResponse(response) {
      response.sendFile = (filePath, options, next) => {
        sendFileCalls.push({
          filePath,
          options
        });
        next();
      };
    }
  });

  assert.deepEqual(sendFileCalls, [
    {
      filePath: "Q:/tmp/preview-1/clip-1/segment_000.ts",
      options: {
        headers: {
          "Content-Type": "video/mp2t",
          "Cache-Control": "no-store"
        }
      }
    }
  ]);
});

test("returns 503 when preview segments are not ready yet", async () => {
  const router = createPreviewsApi({
    async getSegment() {
      return {
        ready: false,
        status: "encoding"
      };
    }
  });
  const response = await runRoute(router, {
    method: "GET",
    url: "/preview-1/clips/clip-1/segments/segment_000.ts"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["Retry-After"], "1");
  assert.deepEqual(response.body, {
    ready: false,
    status: "encoding"
  });
});

function runRoute(router, request) {
  return new Promise((resolve, reject) => {
    const response = createResponse(resolve);

    request.createResponse?.(response);

    router.handle(
      {
        headers: {},
        method: request.method,
        url: request.url
      },
      response,
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response.result);
      }
    );
  });
}

function createResponse(resolve) {
  const result = {
    statusCode: 200,
    headers: {},
    body: undefined
  };

  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    set(name, value) {
      result.headers[name] = value;
      return this;
    },
    type(value) {
      result.headers["Content-Type"] = value;
      return this;
    },
    json(value) {
      result.body = value;
      resolve(result);
      return this;
    },
    send(value) {
      result.body = value;
      resolve(result);
      return this;
    },
    end() {
      resolve(result);
      return this;
    }
  };
}
