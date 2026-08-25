import { Router } from "express";

export function createAddonProxiesApi(addonProxies) {
  const router = Router();

  router.post("/", async (request, response) => {
    response.status(201).json({
      manifestUrl: addonProxies.createManifestProxyUrl(request.body?.manifestUrl)
    });
  });

  router.use("/:encodedManifestUrl", async (request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      next();
      return;
    }

    await addonProxies.handleRequest({
      encodedManifestUrl: request.params.encodedManifestUrl,
      request,
      response
    });
  });

  return router;
}
