import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackStartError } from "../src/common/errors/playback-start-error.js";
import { PlaybackSession } from "../src/playback/playback-session.js";

test("starts by preparing delivery and then requesting control playback", async () => {
  const calls = [];
  const session = new PlaybackSession({
    id: "session-1",
    deviceRegistryId: "registry-device-1",
    deviceKey: "device-key-1",
    source: {
      url: "http://media.test/video.mp4"
    },
    control: {
      kind: "fake-control",
      config: {}
    },
    delivery: {
      kind: "fake-delivery",
      config: {}
    },
    deliveryStrategy: {
      async prepare(source) {
        calls.push({
          action: "prepare",
          source
        });

        return {
          resolvedUrl: source.url,
          contentType: "video/mp4"
        };
      }
    },
    controlStrategy: {
      async play({ session: playbackSession, streamUrl }) {
        calls.push({
          action: "play",
          streamUrl,
          mediaResource: playbackSession.mediaResource
        });

        return {
          status: "playing_requested"
        };
      }
    }
  });

  assert.equal(await session.start({
    streamUrl: "http://latc.test/playback/streams/session-1"
  }), undefined);
  assert.deepEqual(session.mediaResource, {
    resolvedUrl: "http://media.test/video.mp4",
    contentType: "video/mp4"
  });
  assert.deepEqual(calls, [
    {
      action: "prepare",
      source: {
        url: "http://media.test/video.mp4"
      }
    },
    {
      action: "play",
      streamUrl: "http://latc.test/playback/streams/session-1",
      mediaResource: {
        resolvedUrl: "http://media.test/video.mp4",
        contentType: "video/mp4"
      }
    }
  ]);
});

test("patches media resource with shallow partial updates", () => {
  const session = new PlaybackSession({
    id: "session-1",
    deviceRegistryId: "registry-device-1",
    deviceKey: "device-key-1",
    source: {
      url: "http://media.test/video.mp4"
    },
    control: {
      kind: "fake-control",
      config: {}
    },
    delivery: {
      kind: "fake-delivery",
      config: {}
    },
    deliveryStrategy: {},
    controlStrategy: {}
  });

  session.patchMediaResource({
    resolvedUrl: "http://media.test/video.mp4",
    contentType: "video/mp4",
    headers: {
      acceptRanges: "bytes"
    }
  });
  session.patchMediaResource({
    contentType: "video/x-matroska",
    contentLength: "123",
    headers: {
      transferMode: "Interactive"
    }
  });

  assert.deepEqual(session.mediaResource, {
    resolvedUrl: "http://media.test/video.mp4",
    contentType: "video/x-matroska",
    contentLength: "123",
    headers: {
      transferMode: "Interactive"
    }
  });
});

test("wraps unexpected start errors with the original error in details", async () => {
  const originalError = new Error("upstream failed");
  const session = new PlaybackSession({
    id: "session-1",
    deviceRegistryId: "registry-device-1",
    deviceKey: "device-key-1",
    source: {
      url: "http://media.test/video.mp4"
    },
    control: {
      kind: "fake-control",
      config: {}
    },
    delivery: {
      kind: "fake-delivery",
      config: {}
    },
    deliveryStrategy: {
      async prepare() {
        throw originalError;
      }
    },
    controlStrategy: {}
  });

  await assert.rejects(
    () => session.start({
      streamUrl: "http://latc.test/playback/streams/session-1"
    }),
    (error) => {
      assert.equal(error instanceof PlaybackStartError, true);
      assert.equal(error.details.originalError, originalError);
      return true;
    }
  );
});

test("requestClose closes the session and emits the close details", async () => {
  const events = [];
  const disposed = [];
  const session = new PlaybackSession({
    id: "session-1",
    deviceRegistryId: "registry-device-1",
    deviceKey: "device-key-1",
    source: {
      url: "http://media.test/video.mp4"
    },
    control: {
      kind: "fake-control",
      config: {}
    },
    delivery: {
      kind: "fake-delivery",
      config: {}
    },
    deliveryStrategy: {
      async dispose() {
        disposed.push("delivery");
      }
    },
    controlStrategy: {
      async dispose() {
        disposed.push("control");
      }
    }
  });

  session.once("closed", (event) => events.push(event));

  await session.requestClose({
    source: "delivery",
    code: "stream_failed"
  });
  await session.requestClose({
    source: "delivery",
    code: "ignored"
  });

  assert.equal(session.closed, true);
  assert.deepEqual(session.closeDetails, {
    source: "delivery",
    code: "stream_failed"
  });
  assert.deepEqual(disposed.sort(), ["control", "delivery"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].session, session);
  assert.deepEqual(events[0].details, {
    source: "delivery",
    code: "stream_failed"
  });
});
