export const PREVIEW_SUBTITLE_TRACK_STATUS = Object.freeze({
  PREPARING: "preparing",
  READY: "ready",
  FAILED: "failed"
});

export class PreviewSubtitleTrack {
  constructor({
    id,
    url,
    language,
    label
  }) {
    if (!id) {
      throw new Error("Preview subtitle track id is required");
    }

    if (!url) {
      throw new Error("Preview subtitle track url is required");
    }

    this.id = id;
    this.url = url;
    this.language = language;
    this.label = label;
    this.status = PREVIEW_SUBTITLE_TRACK_STATUS.PREPARING;
    this.vttText = undefined;
    this.error = undefined;
  }

  markReady(vttText) {
    this.status = PREVIEW_SUBTITLE_TRACK_STATUS.READY;
    this.vttText = vttText;
    this.error = undefined;
  }

  markFailed(error) {
    this.status = PREVIEW_SUBTITLE_TRACK_STATUS.FAILED;
    this.error = serializeError(error);
  }

  serialize({ subtitleUrl } = {}) {
    return {
      id: this.id,
      url: this.url,
      language: this.language,
      label: this.label,
      status: this.status,
      subtitleUrl,
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
