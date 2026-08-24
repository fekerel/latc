import { Router } from "express";

export function createPlaybackSessionsApi(playback) {
  const router = Router();

  router.post("/sessions", async (request, response) => {
    const result = await playback.createSession(request.body);

    response.status(201).json({
      session: serializeSession(result.session),
      streamUrl: result.streamUrl
    });
  });

  return router;
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
