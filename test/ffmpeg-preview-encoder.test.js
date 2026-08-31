import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FfmpegPreviewEncoder } from "../src/preview/ffmpeg-preview-encoder.js";
import { PreviewClip } from "../src/preview/preview-clip.js";

test("creates HLS ffmpeg arguments for browser preview clips", () => {
  const encoder = new FfmpegPreviewEncoder({
    height: 360,
    segmentSeconds: 2,
    videoCrf: 30,
    audioBitrate: "80k"
  });
  const args = encoder.createHlsArgs({
    sourceUrl: "http://media.test/video.mkv",
    positionSeconds: 300,
    durationSeconds: 20,
    playlistPath: "Q:/preview/playlist.m3u8",
    segmentsDir: "Q:/preview/segments"
  });

  assert.deepEqual(args.slice(0, 12), [
    "-hide_banner",
    "-y",
    "-probesize",
    "5000000",
    "-analyzeduration",
    "5000000",
    "-ss",
    "300",
    "-i",
    "http://media.test/video.mkv",
    "-t",
    "20"
  ]);
  assert.equal(args[args.indexOf("-vf") + 1], "scale=-2:360");
  assert.equal(args[args.indexOf("-crf") + 1], "30");
  assert.equal(args[args.indexOf("-pix_fmt") + 1], "yuv420p");
  assert.equal(args[args.indexOf("-profile:v") + 1], "high");
  assert.equal(args[args.indexOf("-force_key_frames") + 1], "expr:gte(t,n_forced*2)");
  assert.equal(args[args.indexOf("-b:a") + 1], "80k");
  assert.equal(args[args.indexOf("-hls_time") + 1], "2");
  assert.equal(args.at(-1), "Q:/preview/playlist.m3u8");
});

test("marks clips canceled without running ffmpeg when already canceled", async () => {
  let runCalled = false;
  const encoder = new FfmpegPreviewEncoder({
    runFfmpeg: async () => {
      runCalled = true;
    }
  });
  const clip = createClip({
    playlistPath: "Q:/tmp/unused/playlist.m3u8",
    segmentsDir: "Q:/tmp/unused/segments"
  });

  await encoder.encodeClip({
    sourceUrl: "http://media.test/video.mkv",
    clip,
    isCanceled: () => true
  });

  assert.equal(runCalled, false);
  assert.equal(clip.status, "canceled");
});

test("updates clip status from encoding to streamable and ready", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "latc-encoder-test-"));
  const playlistPath = path.join(tempDir, "playlist.m3u8");
  const segmentsDir = path.join(tempDir, "segments");
  const clip = createClip({
    playlistPath,
    segmentsDir
  });
  let releaseRun;
  const runFinished = new Promise((resolve) => {
    releaseRun = resolve;
  });
  const encoder = new FfmpegPreviewEncoder({
    playlistWatchIntervalMs: 10,
    runFfmpeg: async () => {
      await writeFile(path.join(segmentsDir, "segment_000.ts"), "segment");
      await writeFile(
        playlistPath,
        [
          "#EXTM3U",
          "#EXTINF:2.000,",
          "segment_000.ts"
        ].join("\n")
      );
      await runFinished;
    }
  });

  try {
    const encodePromise = encoder.encodeClip({
      sourceUrl: "http://media.test/video.mkv",
      clip
    });

    await waitFor(() => clip.status === "streamable");

    assert.equal(clip.lastGoodPlaylist.includes("segment_000.ts"), true);

    releaseRun();
    await encodePromise;

    assert.equal(clip.status, "ready");
    assert.equal(clip.lastGoodPlaylist.includes("segment_000.ts"), true);
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    });
  }
});

function createClip(options) {
  return new PreviewClip({
    id: "clip-1",
    positionSeconds: 0,
    durationSeconds: 10,
    ...options
  });
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition");
}
