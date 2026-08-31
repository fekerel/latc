import { FfmpegPreviewEncoder } from "./ffmpeg-preview-encoder.js";
import { PreviewEncodeQueue } from "./preview-encode-queue.js";
import { PreviewService } from "./preview-service.js";
import { SubtitlePreviewService } from "./subtitle-preview-service.js";

export function createPreviewModule(options = {}) {
  const service = new PreviewService({
    runtimeDir: options.runtimeDir,
    subtitlePreviewService: options.subtitlePreviewService ??
      new SubtitlePreviewService({
        fetch: options.fetch
      }),
    encoder: options.encoder ?? new FfmpegPreviewEncoder({
      ffmpegPath: options.ffmpegPath,
      height: options.height,
      segmentSeconds: options.segmentSeconds,
      videoCrf: options.videoCrf,
      audioBitrate: options.audioBitrate
    }),
    encodeQueue: options.encodeQueue ?? new PreviewEncodeQueue({
      maxConcurrency: options.maxConcurrency
    }),
    clipPositionsSeconds: options.clipPositionsSeconds,
    clipDurationSeconds: options.clipDurationSeconds,
    basePath: options.basePath,
    ttlMs: options.ttlMs,
    cleanupIntervalMs: options.cleanupIntervalMs
  });

  return {
    createPreview: service.createPreview.bind(service),
    getPreview: service.getPreview.bind(service),
    addSubtitle: service.addSubtitle.bind(service),
    getPlaylist: service.getPlaylist.bind(service),
    getSegment: service.getSegment.bind(service),
    getSegmentPath: service.getSegmentPath.bind(service),
    getSubtitle: service.getSubtitle.bind(service),
    disposePreview: service.disposePreview.bind(service),
    disposeExpiredPreviews: service.disposeExpiredPreviews.bind(service),
    dispose: service.dispose.bind(service)
  };
}
