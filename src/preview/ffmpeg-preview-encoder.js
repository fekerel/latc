import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export class FfmpegPreviewEncoder {
  constructor({
    ffmpegPath = "ffmpeg",
    height = 480,
    segmentSeconds = 2,
    videoCrf = 28,
    audioBitrate = "96k",
    playlistWatchIntervalMs = 250,
    runFfmpeg = runFfmpegProcess
  } = {}) {
    if (!Number.isInteger(height) || height < 1) {
      throw new Error("Preview encoder height must be a positive integer");
    }

    if (!Number.isInteger(segmentSeconds) || segmentSeconds < 1) {
      throw new Error("Preview encoder segmentSeconds must be a positive integer");
    }

    this.ffmpegPath = ffmpegPath;
    this.height = height;
    this.segmentSeconds = segmentSeconds;
    this.videoCrf = videoCrf;
    this.audioBitrate = audioBitrate;
    this.playlistWatchIntervalMs = playlistWatchIntervalMs;
    this.runFfmpeg = runFfmpeg;
  }

  createHlsArgs({
    sourceUrl,
    positionSeconds,
    durationSeconds,
    playlistPath,
    segmentsDir
  }) {
    if (!sourceUrl) {
      throw new Error("Preview encoder sourceUrl is required");
    }

    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
      throw new Error("Preview encoder positionSeconds must be a non-negative number");
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Preview encoder durationSeconds must be a positive number");
    }

    if (!playlistPath) {
      throw new Error("Preview encoder playlistPath is required");
    }

    if (!segmentsDir) {
      throw new Error("Preview encoder segmentsDir is required");
    }

    return [
      "-hide_banner",
      "-y",
      "-probesize",
      "5000000",
      "-analyzeduration",
      "5000000",
      "-ss",
      String(positionSeconds),
      "-i",
      sourceUrl,
      "-t",
      String(durationSeconds),
      "-sn",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=-2:${this.height}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      String(this.videoCrf),
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-force_key_frames",
      `expr:gte(t,n_forced*${this.segmentSeconds})`,
      "-c:a",
      "aac",
      "-b:a",
      this.audioBitrate,
      "-ac",
      "2",
      "-f",
      "hls",
      "-hls_time",
      String(this.segmentSeconds),
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      path.join(segmentsDir, "segment_%03d.ts"),
      playlistPath
    ];
  }

  async encodeClip({
    sourceUrl,
    clip,
    isCanceled = () => false,
    onCancel
  }) {
    if (isCanceled()) {
      clip.markCanceled();
      return;
    }

    await mkdir(clip.segmentsDir, {
      recursive: true
    });

    clip.markEncoding();

    const args = this.createHlsArgs({
      sourceUrl,
      positionSeconds: clip.positionSeconds,
      durationSeconds: clip.durationSeconds,
      playlistPath: clip.playlistPath,
      segmentsDir: clip.segmentsDir
    });
    const playlistWatcher = watchPlaylist({
      clip,
      intervalMs: this.playlistWatchIntervalMs
    });

    try {
      await this.runFfmpeg(this.ffmpegPath, args, {
        onCancel
      });

      await refreshPlaylistSnapshot(clip);
      clip.markReady(clip.lastGoodPlaylist);
    } catch (error) {
      if (isCanceled()) {
        clip.markCanceled();
        return;
      }

      clip.markFailed(error);
      throw error;
    } finally {
      playlistWatcher.stop();
    }
  }
}

function watchPlaylist({ clip, intervalMs }) {
  const timer = setInterval(() => {
    refreshPlaylistSnapshot(clip).catch(() => {});
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    }
  };
}

async function refreshPlaylistSnapshot(clip) {
  const playlistText = await readFile(clip.playlistPath, "utf8");

  if (await isUsablePlaylist({
    playlistText,
    segmentsDir: clip.segmentsDir
  })) {
    clip.markStreamable(playlistText);
  }
}

async function isUsablePlaylist({ playlistText, segmentsDir }) {
  const text = String(playlistText).trim();
  const segmentNames = getPlaylistSegmentNames(text);

  return text.startsWith("#EXTM3U") &&
    segmentNames.length > 0 &&
    await allSegmentsExist({
      segmentNames,
      segmentsDir
    });
}

function getPlaylistSegmentNames(playlistText) {
  return String(playlistText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(getSegmentName)
    .filter((segmentName) => segmentName.endsWith(".ts"));
}

function getSegmentName(segmentUri) {
  const normalizedUri = segmentUri.replaceAll("\\", "/");
  const pathname = normalizedUri.split(/[?#]/)[0];

  return pathname.split("/").at(-1);
}

async function allSegmentsExist({ segmentNames, segmentsDir }) {
  const results = await Promise.all(
    segmentNames.map((segmentName) =>
      access(path.join(segmentsDir, segmentName))
        .then(() => true)
        .catch(() => false)
    )
  );

  return results.every(Boolean);
}

function runFfmpegProcess(ffmpegPath, args, { onCancel } = {}) {
  return new Promise((resolve, reject) => {
    const stderrChunks = [];
    let canceled = false;
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    onCancel?.(() => {
      canceled = true;

      if (!child.killed) {
        child.kill("SIGTERM");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (canceled) {
        reject(new Error("ffmpeg canceled"));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(createFfmpegErrorMessage(code, stderrChunks)));
    });
  });
}

function createFfmpegErrorMessage(code, stderrChunks) {
  const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

  return stderr
    ? `ffmpeg exited with code ${code}: ${stderr}`
    : `ffmpeg exited with code ${code}`;
}
