import { Router } from "express";

export function createSubtitlesApi(subtitles) {
  const router = Router();

  router.post("/discover", async (request, response) => {
    response.json(await subtitles.discover(request.body));
  });

  return router;
}
