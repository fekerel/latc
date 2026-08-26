import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackService } from "../src/playback/playback-service.js";
import { PlaybackSessionStore } from "../src/playback/playback-session-store.js";

test("adds a served subtitle URL to playback sessions", async () => {
  const playedSessions = [];
  const service = new PlaybackService({
    deviceProfileService: {
      async getProfileForDevice() {
        return {
          deviceKey: "device-key-1",
          control: {
            kind: "fake-control",
            config: {}
          },
          delivery: {
            kind: "fake-delivery",
            config: {}
          }
        };
      }
    },
    controlStrategyRegistry: {
      create() {
        return {
          async play({ session }) {
            playedSessions.push(session);
          }
        };
      }
    },
    deliveryStrategyRegistry: {
      create() {
        return {
          async prepare() {
            return {
              contentType: "video/mp4"
            };
          }
        };
      }
    },
    sessionStore: new PlaybackSessionStore(),
    getPublicBaseUrl: () => "http://latc.test"
  });

  const result = await service.createSession({
    deviceRegistryId: "device-1",
    sourceUrl: "http://media.test/video.mp4",
    subtitleUrl: "http://media.test/subtitle.srt"
  });

  assert.equal(result.session.source.subtitles.length, 1);
  assert.deepEqual(result.session.source.subtitles[0], {
    id: "default",
    url: "http://media.test/subtitle.srt",
    format: "srt",
    deliveryUrl: `http://latc.test/playback/files/${result.session.id}/video.srt`
  });
  assert.equal(
    result.streamUrl,
    `http://latc.test/playback/files/${result.session.id}/video.mp4`
  );
  assert.equal(playedSessions[0], result.session);
});

test("serves subtitle HEAD requests from the session subtitle source", async () => {
  const fetchCalls = [];
  let bodyCancelled = false;
  const service = new PlaybackService({
    deviceProfileService: {},
    controlStrategyRegistry: {},
    deliveryStrategyRegistry: {},
    sessionStore: {
      getSession() {
        return {
          source: {
            subtitles: [
              {
                id: "default",
                url: "http://media.test/subtitle.srt",
                format: "srt"
              }
            ]
          }
        };
      }
    },
    getPublicBaseUrl: () => "http://latc.test",
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });

      return {
        status: 200,
        headers: new Map([["content-length", "321"]]),
        body: {
          async cancel() {
            bodyCancelled = true;
          }
        }
      };
    }
  });
  const response = createFakeResponse();

  await service.handleSubtitleRequest("session-1", "default", {
    request: {
      method: "HEAD"
    },
    response
  });

  assert.deepEqual(fetchCalls, [
    {
      url: "http://media.test/subtitle.srt",
      options: {
        method: "GET"
      }
    }
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/x-subrip; charset=utf-8");
  assert.equal(response.headers["content-length"], "321");
  assert.equal(response.headers.connection, "close");
  assert.equal(response.ended, true);
  assert.equal(bodyCancelled, true);
});

test("supports multiple subtitle options with the same language", async () => {
  const service = new PlaybackService({
    deviceProfileService: {
      async getProfileForDevice() {
        return {
          deviceKey: "device-key-1",
          control: {
            kind: "fake-control",
            config: {}
          },
          delivery: {
            kind: "fake-delivery",
            config: {}
          }
        };
      }
    },
    controlStrategyRegistry: {
      create() {
        return {
          async play() {}
        };
      }
    },
    deliveryStrategyRegistry: {
      create() {
        return {
          async prepare() {
            return {
              contentType: "video/mp4"
            };
          }
        };
      }
    },
    sessionStore: new PlaybackSessionStore(),
    getPublicBaseUrl: () => "http://latc.test"
  });

  const result = await service.createSession({
    deviceRegistryId: "device-1",
    sourceUrl: "http://media.test/video.mp4",
    subtitles: [
      {
        id: "tr-main",
        url: "http://media.test/tr-main.srt",
        language: "tr",
        label: "Turkish"
      },
      {
        id: "tr-sdh",
        url: "http://media.test/tr-sdh.srt",
        language: "tr",
        label: "Turkish SDH"
      }
    ]
  });

  assert.deepEqual(result.session.source.subtitles, [
    {
      id: "tr-main",
      url: "http://media.test/tr-main.srt",
      format: "srt",
      language: "tr",
      label: "Turkish",
      contentType: undefined,
      deliveryUrl: `http://latc.test/playback/files/${result.session.id}/video.tr-main.srt`
    },
    {
      id: "tr-sdh",
      url: "http://media.test/tr-sdh.srt",
      format: "srt",
      language: "tr",
      label: "Turkish SDH",
      contentType: undefined,
      deliveryUrl: `http://latc.test/playback/files/${result.session.id}/video.tr-sdh.srt`
    }
  ]);
});

function createFakeResponse() {
  return {
    statusCode: undefined,
    headers: {},
    ended: false,
    headersSent: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      this.headersSent = true;
    },
    end() {
      this.ended = true;
    }
  };
}
