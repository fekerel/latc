import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackFilesRouter } from "../src/http/media/playback-files.js";

test("routes same-basename video and subtitle files to playback handlers", async () => {
  const calls = [];
  const playback = {
    async handleRequest(sessionId, { response }) {
      calls.push({
        type: "video",
        sessionId
      });
      response.end();
    },
    async handleSubtitleRequest(sessionId, subtitleId, { response }) {
      calls.push({
        type: "subtitle",
        sessionId,
        subtitleId
      });
      response.end();
    }
  };
  const router = createPlaybackFilesRouter(playback);

  await runRoute(router, {
    method: "GET",
    url: "/session-1/video.mp4"
  });
  await runRoute(router, {
    method: "HEAD",
    url: "/session-1/video.srt"
  });
  await runRoute(router, {
    method: "GET",
    url: "/session-1/video.tr-main.srt"
  });

  assert.deepEqual(calls, [
    {
      type: "video",
      sessionId: "session-1"
    },
    {
      type: "subtitle",
      sessionId: "session-1",
      subtitleId: "default"
    },
    {
      type: "subtitle",
      sessionId: "session-1",
      subtitleId: "tr-main"
    }
  ]);
});

function runRoute(router, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("route did not finish"));
    }, 1000);
    const response = {
      end() {
        clearTimeout(timeout);
        resolve();
      }
    };

    router.handle(
      {
        ...request,
        headers: {},
        method: request.method,
        url: request.url
      },
      response,
      (error) => {
        clearTimeout(timeout);

        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}
