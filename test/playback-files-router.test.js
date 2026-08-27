import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackFilesRouter } from "../src/http/media/playback-files.js";

test("routes playback files by resource kind", async () => {
  const calls = [];
  const playback = {
    async handleRequest(sessionId, { resourceKind, response }) {
      calls.push({
        sessionId,
        resourceKind
      });
      response.end();
    }
  };
  const router = createPlaybackFilesRouter(playback);

  await runRoute(router, {
    method: "GET",
    url: "/session-1/video"
  });
  await runRoute(router, {
    method: "HEAD",
    url: "/session-1/subtitle"
  });

  assert.deepEqual(calls, [
    {
      sessionId: "session-1",
      resourceKind: "video"
    },
    {
      sessionId: "session-1",
      resourceKind: "subtitle"
    }
  ]);
});

function runRoute(router, request) {
  return new Promise((resolve, reject) => {
    const response = {
      end() {
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
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}
