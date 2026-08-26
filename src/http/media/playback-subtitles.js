import { Router } from "express";

export function createPlaybackSubtitlesRouter(playback) {
  const router = Router();

  router.head("/:sessionId/:subtitleFile", handleSubtitleRequest(playback));
  router.get("/:sessionId/:subtitleFile", handleSubtitleRequest(playback));

  return router;
}

function handleSubtitleRequest(playback) {
  return async (request, response) => {
    await playback.handleSubtitleRequest(
      request.params.sessionId,
      parseSubtitleId(request.params.subtitleFile),
      {
        request,
        response
      }
    );
  };
}

function parseSubtitleId(subtitleFile) {
  return parseSubtitleIdFromFileName(subtitleFile);
}

export function parseSubtitleIdFromFileName(subtitleFile) {
  const match = /^video(?:\.([a-zA-Z0-9_-]+))?\.srt$/i.exec(subtitleFile);

  if (match) {
    return match[1] ?? "default";
  }

  return subtitleFile.replace(/\.srt$/i, "");
}
