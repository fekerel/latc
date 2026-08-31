export const PREVIEW_CLIP_STATUS = Object.freeze({
  QUEUED: "queued",
  ENCODING: "encoding",
  STREAMABLE: "streamable",
  READY: "ready",
  FAILED: "failed",
  CANCELED: "canceled"
});

export class PreviewClip {
  constructor({
    id,
    positionSeconds,
    durationSeconds,
    playlistPath,
    segmentsDir
  }) {
    if (!id) {
      throw new Error("Preview clip id is required");
    }

    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
      throw new Error("Preview clip positionSeconds must be a non-negative number");
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Preview clip durationSeconds must be a positive number");
    }

    this.id = id;
    this.positionSeconds = positionSeconds;
    this.durationSeconds = durationSeconds;
    this.playlistPath = playlistPath;
    this.segmentsDir = segmentsDir;
    this.status = PREVIEW_CLIP_STATUS.QUEUED;
    this.lastGoodPlaylist = undefined;
    this.error = undefined;
  }

  markEncoding() {
    this.status = PREVIEW_CLIP_STATUS.ENCODING;
    this.error = undefined;
  }

  markStreamable(playlistText) {
    this.status = PREVIEW_CLIP_STATUS.STREAMABLE;
    this.lastGoodPlaylist = playlistText;
  }

  markReady(playlistText = this.lastGoodPlaylist) {
    this.status = PREVIEW_CLIP_STATUS.READY;
    this.lastGoodPlaylist = playlistText;
  }

  markFailed(error) {
    this.status = PREVIEW_CLIP_STATUS.FAILED;
    this.error = serializeError(error);
  }

  markCanceled() {
    this.status = PREVIEW_CLIP_STATUS.CANCELED;
  }

  serialize({ playlistUrl } = {}) {
    return {
      id: this.id,
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
      status: this.status,
      playlistUrl,
      error: this.error
    };
  }
}

function serializeError(error) {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message
  };
}
