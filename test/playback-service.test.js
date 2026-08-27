import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackService } from "../src/playback/playback-service.js";
import { PlaybackSessionStore } from "../src/playback/playback-session-store.js";

test("creates sessions with selected subtitle source and media file URLs", async () => {
  const playCalls = [];
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
          async play(input) {
            playCalls.push(input);
          }
        };
      }
    },
    deliveryStrategyRegistry: {
      create() {
        return {
          async prepare(source) {
            return {
              video: {
                contentType: "video/mp4"
              },
              subtitle: source.subtitle
                ? {
                    contentType: "application/x-subrip; charset=utf-8",
                    language: source.subtitle.language
                  }
                : undefined
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
    subtitle: {
      url: "http://media.test/subtitle.srt",
      language: "eng"
    }
  });

  assert.equal(
    result.streamUrl,
    `http://latc.test/playback/files/${result.session.id}/video`
  );
  assert.deepEqual(result.session.source, {
    url: "http://media.test/video.mp4",
    subtitle: {
      url: "http://media.test/subtitle.srt",
      language: "eng"
    }
  });
  assert.equal(
    playCalls[0].subtitleUrl,
    `http://latc.test/playback/files/${result.session.id}/subtitle`
  );
});
