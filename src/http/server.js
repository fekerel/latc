import express from "express";
import http from "node:http";
import { registerApiRoutes } from "./api/index.js";
import { createPlaybackStreamsRouter } from "./media/playback-streams.js";
import { globalErrorHandler } from "./middleware/global-error-handler.js";
import { createStremioWebRouter } from "./web/stremio-web.js";
import { registerWebSocket } from "./websocket.js";

const WS_PREFIX = "/ws";

export function createServer(app, options = {}) {
  const expressApp = express();

  registerApiRoutes(expressApp, app);
  expressApp.use(
    "/playback/streams",
    createPlaybackStreamsRouter(app.playback)
  );
  expressApp.use("/web", createStremioWebRouter(options.web));

  expressApp.use(globalErrorHandler);

  const server = http.createServer(expressApp);

  registerWebSocket({
    server,
    path: `${WS_PREFIX}/discovery`,
    handleConnection: app.discovery.handleWebSocket
  });

  return server;
}
