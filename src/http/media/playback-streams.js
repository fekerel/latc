import { Router } from "express";

export function createPlaybackStreamsRouter(playback) {
  const router = Router();

  router.head("/:sessionId", handlePlaybackRequest(playback));
  router.get("/:sessionId", handlePlaybackRequest(playback));

  return router;
}

function handlePlaybackRequest(playback) {
  return async (request, response) => {
    await playback.handleRequest(request.params.sessionId, {
      request,
      response
    });
  };
}
