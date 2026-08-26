import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSubtitleRequestUrl,
  SubtitleDiscoveryService
} from "../src/subtitles/subtitle-discovery-service.js";

test("creates OpenSubtitles addon request URLs from stream metadata", () => {
  assert.equal(
    createSubtitleRequestUrl({
      subtitleAddonTransportUrl: "https://opensubtitles-v3.strem.io",
      type: "series",
      videoId: "tt10986410:1:5",
      filename:
        "Ted.Lasso.S01E05.2160p.ATVP.WEB-DL.x265.10bit.HDR.DDP5.1.Atmos-NOGRP.mkv",
      videoSize: 5876030806,
      videoHash: "96382b51bf36504c"
    }),
    "https://opensubtitles-v3.strem.io/subtitles/series/tt10986410%3A1%3A5/filename=Ted.Lasso.S01E05.2160p.ATVP.WEB-DL.x265.10bit.HDR.DDP5.1.Atmos-NOGRP.mkv&videoSize=5876030806&videoHash=96382b51bf36504c.json"
  );
});

test("omits empty optional subtitle request extras", () => {
  assert.equal(
    createSubtitleRequestUrl({
      subtitleAddonTransportUrl: "https://opensubtitles-v3.strem.io/",
      type: "movie",
      videoId: "tt123",
      filename: "",
      videoSize: undefined,
      videoHash: null
    }),
    "https://opensubtitles-v3.strem.io/subtitles/movie/tt123.json"
  );
});

test("creates subtitle request URLs from manifest transport URLs", () => {
  assert.equal(
    createSubtitleRequestUrl({
      subtitleAddonTransportUrl: "https://opensubtitles-v3.strem.io/manifest.json",
      type: "movie",
      videoId: "tt123"
    }),
    "https://opensubtitles-v3.strem.io/subtitles/movie/tt123.json"
  );
});

test("groups discovered subtitles by language and sorts each group by id", async () => {
  const fetchCalls = [];
  const service = new SubtitleDiscoveryService({
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            subtitles: [
              {
                id: "20",
                lang: "eng",
                url: "https://subs.test/20.srt"
              },
              {
                id: "3",
                lang: "hun",
                url: "https://subs.test/3.srt"
              },
              {
                id: "10",
                lang: "eng",
                url: "https://subs.test/10.srt"
              },
              {
                id: "2",
                lang: "eng",
                url: "https://subs.test/2.srt"
              }
            ]
          };
        }
      };
    }
  });

  assert.deepEqual(
    await service.discover({
      subtitleAddonTransportUrl: "https://opensubtitles-v3.strem.io",
      type: "series",
      videoId: "tt10986410:1:5",
      filename: "Ted Lasso.mkv"
    }),
    {
      eng: [
        {
          id: "2",
          lang: "eng",
          url: "https://subs.test/2.srt"
        },
        {
          id: "10",
          lang: "eng",
          url: "https://subs.test/10.srt"
        },
        {
          id: "20",
          lang: "eng",
          url: "https://subs.test/20.srt"
        }
      ],
      hun: [
        {
          id: "3",
          lang: "hun",
          url: "https://subs.test/3.srt"
        }
      ]
    }
  );
  assert.deepEqual(fetchCalls, [
    {
      url: "https://opensubtitles-v3.strem.io/subtitles/series/tt10986410%3A1%3A5/filename=Ted%20Lasso.mkv.json",
      options: {
        headers: {
          accept: "application/json"
        }
      }
    }
  ]);
});
