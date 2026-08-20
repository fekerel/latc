import { Router } from "express";

export function createPlaybackRouter(playback) {
  const router = Router();

  router.post("/sessions", async (request, response, next) => {
    const result = await playback.createSession(request.body);

    response.status(201).json({
      session: serializeSession(result.session),
      streamUrl: result.streamUrl
    });
  });

  router.head("/streams/:sessionId", handlePlaybackRequest(playback));
  router.get("/streams/:sessionId", handlePlaybackRequest(playback));

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

function serializeSession(session) {
  return {
    id: session.id,
    deviceRegistryId: session.deviceRegistryId,
    deviceKey: session.deviceKey,
    source: session.source,
    control: session.control,
    delivery: session.delivery,
    mediaResource: session.mediaResource,
    closed: session.closed,
    closeDetails: session.closeDetails,
    createdAt: session.createdAt.toISOString()
  };
}
