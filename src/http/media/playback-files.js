import { Router } from "express";
import { NotFoundError } from "../../common/errors/not-found-error.js";
import { parseSubtitleIdFromFileName } from "./playback-subtitles.js";

export function createPlaybackFilesRouter(playback) {
  const router = Router();

  router.head("/:sessionId/:fileName", handlePlaybackFileRequest(playback));
  router.get("/:sessionId/:fileName", handlePlaybackFileRequest(playback));

  return router;
}

function handlePlaybackFileRequest(playback) {
  return async (request, response) => {
    if (isSubtitleFile(request.params.fileName)) {
      await playback.handleSubtitleRequest(
        request.params.sessionId,
        parseSubtitleIdFromFileName(request.params.fileName),
        {
          request,
          response
        }
      );
      return;
    }

    if (isVideoFile(request.params.fileName)) {
      await playback.handleRequest(request.params.sessionId, {
        request,
        response
      });
      return;
    }

    throw new NotFoundError("Playback file not found");
  };
}

function isVideoFile(fileName) {
  return /^video\.[^.]+$/i.test(fileName) && !isSubtitleFile(fileName);
}

function isSubtitleFile(fileName) {
  return /^video(?:\.[a-zA-Z0-9_-]+)?\.srt$/i.test(fileName);
}
