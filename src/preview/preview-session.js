import { randomUUID } from "node:crypto";
import { PREVIEW_CLIP_STATUS } from "./preview-clip.js";

export const PREVIEW_SESSION_STATUS = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DISPOSED: "disposed"
});

export class PreviewSession {
  constructor({
    id = randomUUID(),
    source,
    clips = [],
    subtitleTracks = [],
    createdAt = new Date()
  }) {
    if (!source?.url) {
      throw new Error("Preview session source.url is required");
    }

    this.id = id;
    this.source = source;
    this.clips = new Map(clips.map((clip) => [clip.id, clip]));
    this.subtitleTracks = new Map(
      subtitleTracks.map((track) => [track.id, track])
    );
    this.status = PREVIEW_SESSION_STATUS.ACTIVE;
    this.createdAt = createdAt;
    this.lastAccessedAt = createdAt;
  }

  touch(now = new Date()) {
    this.lastAccessedAt = now;
  }

  addClip(clip) {
    this.clips.set(clip.id, clip);
  }

  getClip(clipId) {
    return this.clips.get(clipId);
  }

  getClips() {
    return [...this.clips.values()];
  }

  addSubtitleTrack(track) {
    this.subtitleTracks.set(track.id, track);
  }

  getSubtitleTrack(trackId) {
    return this.subtitleTracks.get(trackId);
  }

  getSubtitleTracks() {
    return [...this.subtitleTracks.values()];
  }

  activate() {
    if (this.status !== PREVIEW_SESSION_STATUS.DISPOSED) {
      this.status = PREVIEW_SESSION_STATUS.ACTIVE;
    }
  }

  suspend() {
    if (this.status !== PREVIEW_SESSION_STATUS.DISPOSED) {
      this.status = PREVIEW_SESSION_STATUS.SUSPENDED;

      for (const clip of this.clips.values()) {
        if (
          clip.status === PREVIEW_CLIP_STATUS.ENCODING ||
          clip.status === PREVIEW_CLIP_STATUS.STREAMABLE
        ) {
          clip.markCanceled();
        }
      }
    }
  }

  dispose() {
    this.status = PREVIEW_SESSION_STATUS.DISPOSED;

    for (const clip of this.clips.values()) {
      if (clip.status !== PREVIEW_CLIP_STATUS.READY) {
        clip.markCanceled();
      }
    }
  }

  isExpired(ttlMs, now = new Date()) {
    return now.getTime() - this.lastAccessedAt.getTime() > ttlMs;
  }

  serialize({ createClipPlaylistUrl, createSubtitleUrl } = {}) {
    return {
      id: this.id,
      source: this.source,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      lastAccessedAt: this.lastAccessedAt.toISOString(),
      clips: this.getClips().map((clip) =>
        clip.serialize({
          playlistUrl: createClipPlaylistUrl?.(this, clip)
        })
      ),
      subtitles: this.getSubtitleTracks().map((track) =>
        track.serialize({
          subtitleUrl: createSubtitleUrl?.(this, track)
        })
      )
    };
  }
}
