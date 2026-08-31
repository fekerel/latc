import { Router } from "express";

export function createPreviewsApi(preview) {
  const router = Router();

  router.post("/", async (request, response) => {
    response.status(201).json(await preview.createPreview(request.body));
  });

  router.get("/:previewId/clips/:clipId/playlist.m3u8", (request, response) => {
    const result = preview.getPlaylist(
      request.params.previewId,
      request.params.clipId
    );

    if (!result.ready) {
      response
        .status(202)
        .set("Retry-After", "1")
        .json(result);
      return;
    }

    response
      .type("application/vnd.apple.mpegurl")
      .set("Cache-Control", "no-store")
      .send(result.playlistText);
  });

  router.get(
    "/:previewId/clips/:clipId/segments/:segmentName",
    async (request, response, next) => {
      const result = await preview.getSegment(
        request.params.previewId,
        request.params.clipId,
        request.params.segmentName
      );

      if (!result.ready) {
        response
          .status(result.status === "failed" ? 404 : 503)
          .set("Retry-After", "1")
          .json(result);
        return;
      }

      response.sendFile(
        result.segmentPath,
        {
          headers: {
            "Content-Type": "video/mp2t",
            "Cache-Control": "no-store"
          }
        },
        next
      );
    }
  );

  router.get("/:previewId/subtitles/:subtitleId", (request, response) => {
    const result = preview.getSubtitle(
      request.params.previewId,
      request.params.subtitleId
    );

    if (!result.ready) {
      response
        .status(202)
        .set("Retry-After", "1")
        .json(result);
      return;
    }

    response
      .type("text/vtt; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(result.vttText);
  });

  router.get("/:previewId", (request, response) => {
    response.json(preview.getPreview(request.params.previewId));
  });

  router.post("/:previewId/subtitles", async (request, response) => {
    response.status(201).json(
      await preview.addSubtitle(request.params.previewId, request.body)
    );
  });

  router.delete("/:previewId", async (request, response) => {
    await preview.disposePreview(request.params.previewId);

    response.status(204).end();
  });

  return router;
}
