import { Router } from "express";
import { NotFoundError } from "../../common/errors/not-found-error.js";

export function createPlaybackFilesRouter(playback) {
  const router = Router();

  router.head("/:sessionId/:resourceKind", handlePlaybackFileRequest(playback));
  router.get("/:sessionId/:resourceKind", handlePlaybackFileRequest(playback));

  return router;
}

function handlePlaybackFileRequest(playback) {
  return async (request, response) => {
    const resourceKind = parseResourceKind(request.params.resourceKind);

    await playback.handleRequest(request.params.sessionId, {
      resourceKind,
      request,
      response
    });
  };
}

function parseResourceKind(value) {
  if (value === "video" || value === "subtitle") {
    return value;
  }

  throw new NotFoundError("Playback file not found");
}
