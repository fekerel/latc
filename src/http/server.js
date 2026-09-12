import express from "express";
import http from "node:http";
import { registerApiRoutes } from "./api/index.js";
import { createPlaybackFilesRouter } from "./media/playback-files.js";
import { createPlaybackStreamsRouter } from "./media/playback-streams.js";
import { globalErrorHandler } from "./middleware/global-error-handler.js";
import { createStremioWebRouter } from "./web/stremio-web.js";
import { registerWebSocket } from "./websocket.js";

const WS_PREFIX = "/ws";

function allowAllCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "*"
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

export function createServer(app, options = {}) {
  const expressApp = express();

  expressApp.use(allowAllCors);

  registerApiRoutes(expressApp, app);
  expressApp.use(
    "/playback/files",
    createPlaybackFilesRouter(app.playback)
  );
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
