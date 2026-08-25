import express, { Router } from "express";
import { createAddonProxiesApi } from "./addon-proxies.js";
import { createDeviceProfilesApi } from "./device-profiles.js";
import { createDiscoveryApi } from "./discovery.js";
import { createPlaybackSessionsApi } from "./playback-sessions.js";

export function registerApiRoutes(expressApp, app) {
  const apiRouter = Router();

  apiRouter.use(express.json());
  apiRouter.use("/addon-proxies", createAddonProxiesApi(app.addonProxies));
  apiRouter.use("/discovery", createDiscoveryApi(app.discovery));
  apiRouter.use(
    "/device-profiles",
    createDeviceProfilesApi(app.playback.deviceProfiles)
  );
  apiRouter.use("/playback", createPlaybackSessionsApi(app.playback));

  expressApp.use("/api", apiRouter);
}
