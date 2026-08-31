import { access, rm } from "node:fs/promises";
import path from "node:path";
import { BadRequestError } from "../common/errors/bad-request-error.js";
import { NotFoundError } from "../common/errors/not-found-error.js";
import {
  PREVIEW_CLIP_STATUS,
  PreviewClip
} from "./preview-clip.js";
import { PreviewEncodeQueue } from "./preview-encode-queue.js";
import {
  PREVIEW_SESSION_STATUS,
  PreviewSession
} from "./preview-session.js";
import { PreviewSubtitleTrack } from "./preview-subtitle-track.js";
import { FfmpegPreviewEncoder } from "./ffmpeg-preview-encoder.js";
import { SubtitlePreviewService } from "./subtitle-preview-service.js";

const DEFAULT_CLIP_POSITIONS_SECONDS = [300, 900, 1800, 2700, 3600];
const DEFAULT_CLIP_DURATION_SECONDS = 20;
const DEFAULT_BASE_PATH = "/api/previews";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;

export class PreviewService {
  constructor({
    runtimeDir = path.resolve(process.cwd(), "latc-runtime", "preview"),
    subtitlePreviewService = new SubtitlePreviewService(),
    encoder = new FfmpegPreviewEncoder(),
    encodeQueue = new PreviewEncodeQueue(),
    clipPositionsSeconds = DEFAULT_CLIP_POSITIONS_SECONDS,
    clipDurationSeconds = DEFAULT_CLIP_DURATION_SECONDS,
    basePath = DEFAULT_BASE_PATH,
    ttlMs = DEFAULT_TTL_MS,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS
  } = {}) {
    this.runtimeDir = runtimeDir;
    this.subtitlePreviewService = subtitlePreviewService;
    this.encoder = encoder;
    this.encodeQueue = encodeQueue;
    this.clipPositionsSeconds = clipPositionsSeconds;
    this.clipDurationSeconds = clipDurationSeconds;
    this.basePath = basePath;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this.cleanupTimer = startCleanupTimer({
      intervalMs: cleanupIntervalMs,
      cleanup: () => this.disposeExpiredPreviews().catch((error) => {
        console.error("[preview-service] cleanup failed", error);
      })
    });
  }

  async createPreview({ sourceUrl, subtitle } = {}) {
    if (!sourceUrl) {
      throw new BadRequestError("sourceUrl is required");
    }

    this.suspendActiveSessions();

    const session = new PreviewSession({
      source: {
        url: sourceUrl
      }
    });

    for (const clip of this.createClips(session.id)) {
      session.addClip(clip);
    }

    this.sessions.set(session.id, session);

    if (subtitle?.url) {
      await this.addSubtitle(session.id, subtitle);
    }

    this.enqueueSessionClips(session);

    return this.serializePreview(session);
  }

  getPreview(previewId) {
    const session = this.getSession(previewId);

    return this.serializePreview(session);
  }

  getPlaylist(previewId, clipId) {
    const clip = this.getClip(previewId, clipId);

    if (!clip.lastGoodPlaylist) {
      return {
        ready: false,
        status: clip.status,
        clip: clip.serialize({
          playlistUrl: this.createClipPlaylistUrl(previewId, clip.id)
        })
      };
    }

    return {
      ready: true,
      playlistText: rewritePlaylistSegmentUrls({
        playlistText: clip.lastGoodPlaylist,
        createSegmentUrl: (segmentName) =>
          this.createClipSegmentUrl(previewId, clip.id, segmentName)
      })
    };
  }

  getSegmentPath(previewId, clipId, segmentName) {
    if (!isSafeSegmentName(segmentName)) {
      throw new BadRequestError("Invalid segment name");
    }

    const clip = this.getClip(previewId, clipId);

    return path.join(clip.segmentsDir, segmentName);
  }

  async getSegment(previewId, clipId, segmentName) {
    const segmentPath = this.getSegmentPath(previewId, clipId, segmentName);
    const clip = this.getClip(previewId, clipId);

    if (await pathExists(segmentPath)) {
      return {
        ready: true,
        segmentPath
      };
    }

    return {
      ready: false,
      status: clip.status,
      clip: clip.serialize({
        playlistUrl: this.createClipPlaylistUrl(previewId, clip.id)
      })
    };
  }

  getSubtitle(previewId, subtitleId) {
    const session = this.getSession(previewId);
    const track = session.getSubtitleTrack(removeVttExtension(subtitleId));

    if (!track) {
      throw new NotFoundError("Preview subtitle track not found", {
        previewId,
        subtitleId
      });
    }

    if (!track.vttText) {
      return {
        ready: false,
        status: track.status,
        subtitle: this.serializeSubtitleTrack(session, track)
      };
    }

    return {
      ready: true,
      vttText: track.vttText
    };
  }

  async addSubtitle(previewId, subtitle) {
    const session = this.getSession(previewId);
    const track = new PreviewSubtitleTrack({
      id: `subtitle-${session.getSubtitleTracks().length + 1}`,
      url: subtitle.url,
      language: subtitle.language ?? subtitle.lang,
      label: subtitle.label
    });

    session.addSubtitleTrack(track);

    try {
      track.markReady(await this.subtitlePreviewService.prepareSubtitle({
        url: track.url
      }));
    } catch (error) {
      track.markFailed(error);
    }

    return this.serializeSubtitleTrack(session, track);
  }

  async disposePreview(previewId) {
    const session = this.sessions.get(previewId);

    if (!session) {
      return false;
    }

    this.encodeQueue.cancelSessionJobs(session.id);
    session.dispose();
    this.sessions.delete(session.id);

    await removeSessionRuntimeDir({
      runtimeDir: this.runtimeDir,
      sessionId: session.id
    });

    return true;
  }

  async disposeExpiredPreviews(now = new Date()) {
    const expiredSessionIds = [...this.sessions.values()]
      .filter((session) => session.isExpired(this.ttlMs, now))
      .map((session) => session.id);

    await Promise.all(
      expiredSessionIds.map((sessionId) => this.disposePreview(sessionId))
    );

    return expiredSessionIds.length;
  }

  async dispose() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    await Promise.all(
      [...this.sessions.keys()].map((sessionId) =>
        this.disposePreview(sessionId)
      )
    );
  }

  getSession(previewId) {
    const session = this.sessions.get(previewId);

    if (!session) {
      throw new NotFoundError("Preview session not found", {
        previewId
      });
    }

    session.touch();

    if (session.status === PREVIEW_SESSION_STATUS.SUSPENDED) {
      this.reactivateSession(session);
    }

    return session;
  }

  getClip(previewId, clipId) {
    const session = this.getSession(previewId);
    const clip = session.getClip(clipId);

    if (!clip) {
      throw new NotFoundError("Preview clip not found", {
        previewId,
        clipId
      });
    }

    return clip;
  }

  createClips(sessionId) {
    return this.clipPositionsSeconds.map((positionSeconds, index) => {
      const clipId = `clip-${index + 1}`;
      const clipDir = path.join(this.runtimeDir, sessionId, "clips", clipId);

      return new PreviewClip({
        id: clipId,
        positionSeconds,
        durationSeconds: this.clipDurationSeconds,
        playlistPath: path.join(clipDir, "playlist.m3u8"),
        segmentsDir: path.join(clipDir, "segments")
      });
    });
  }

  enqueueSessionClips(session) {
    for (const [index, clip] of session.getClips().entries()) {
      if (!shouldEncodeClip(clip)) {
        continue;
      }

      this.encodeQueue.enqueue({
        id: createEncodeJobId(session.id, clip.id),
        sessionId: session.id,
        priority: index === 0 ? 100 : 0,
        run: ({ isCanceled, onCancel }) =>
          this.encoder.encodeClip({
            sourceUrl: session.source.url,
            clip,
            isCanceled,
            onCancel
          })
      });
    }
  }

  suspendActiveSessions() {
    for (const session of this.sessions.values()) {
      if (session.status === PREVIEW_SESSION_STATUS.ACTIVE) {
        this.suspendSession(session);
      }
    }
  }

  suspendSession(session) {
    this.encodeQueue.cancelSessionJobs(session.id);
    session.suspend();
  }

  reactivateSession(session) {
    this.suspendActiveSessions();
    session.activate();
    this.enqueueSessionClips(session);
  }

  serializePreview(session) {
    return session.serialize({
      createClipPlaylistUrl: (previewSession, clip) =>
        this.createClipPlaylistUrl(previewSession.id, clip.id),
      createSubtitleUrl: (previewSession, track) =>
        this.createSubtitleUrl(previewSession.id, track.id)
    });
  }

  serializeSubtitleTrack(session, track) {
    return track.serialize({
      subtitleUrl: this.createSubtitleUrl(session.id, track.id)
    });
  }

  createSubtitleUrl(previewId, subtitleId) {
    return `${this.basePath}/${previewId}/subtitles/${subtitleId}.vtt`;
  }

  createClipPlaylistUrl(previewId, clipId) {
    return `${this.basePath}/${previewId}/clips/${clipId}/playlist.m3u8`;
  }

  createClipSegmentUrl(previewId, clipId, segmentName) {
    return `${this.basePath}/${previewId}/clips/${clipId}/segments/${segmentName}`;
  }
}

function startCleanupTimer({ intervalMs, cleanup }) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return undefined;
  }

  const timer = setInterval(cleanup, intervalMs);
  timer.unref?.();

  return timer;
}

async function removeSessionRuntimeDir({ runtimeDir, sessionId }) {
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  const resolvedSessionDir = path.resolve(resolvedRuntimeDir, sessionId);

  if (!isPathInside(resolvedSessionDir, resolvedRuntimeDir)) {
    throw new Error("Preview session runtime path is outside runtimeDir");
  }

  await rm(resolvedSessionDir, {
    recursive: true,
    force: true
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(childPath, parentPath) {
  const relativePath = path.relative(parentPath, childPath);

  return Boolean(relativePath) &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath);
}

function createEncodeJobId(sessionId, clipId) {
  return `${sessionId}:${clipId}`;
}

function shouldEncodeClip(clip) {
  return [
    PREVIEW_CLIP_STATUS.QUEUED,
    PREVIEW_CLIP_STATUS.CANCELED
  ].includes(clip.status);
}

function isSafeSegmentName(segmentName) {
  return /^[a-zA-Z0-9._-]+\.ts$/.test(segmentName);
}

function removeVttExtension(subtitleId) {
  return subtitleId.endsWith(".vtt")
    ? subtitleId.slice(0, -4)
    : subtitleId;
}

function rewritePlaylistSegmentUrls({ playlistText, createSegmentUrl }) {
  return String(playlistText)
    .split(/\r?\n/)
    .map((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        return line;
      }

      return createSegmentUrl(getSegmentName(trimmedLine));
    })
    .join("\n");
}

function getSegmentName(segmentUri) {
  const normalizedUri = segmentUri.replaceAll("\\", "/");
  const pathname = normalizedUri.split(/[?#]/)[0];

  return pathname.split("/").at(-1);
}
