import express from "express";
import http from "node:http";
import cors from "cors";
import { registerWebSocket } from "./websocket.js";
import { createDiscoveryRouter } from "./routers/discovery-router.js";
import { createDeviceProfileRouter } from "./routers/device-profile-router.js";
import { createPlaybackRouter } from "./routers/playback-router.js";
import { createAddonsRouter } from "./routers/addons-router.js";
import { globalErrorHandler } from "./global-error-handler.js";

export function createServer(app) {
  const expressApp = express();

  expressApp.use(cors({
    origin: [
        'https://localhost:8080',
        'http://localhost:8080',
        'https://192.168.1.4:8080',
        'http://192.168.1.4:8080',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  expressApp.use(express.json());

  expressApp.use("/discovery", createDiscoveryRouter(app.discovery));
  expressApp.use("/device-profiles", createDeviceProfileRouter(app.playback.deviceProfiles));
  expressApp.use("/playback", createPlaybackRouter(app.playback));
  expressApp.use("/addons", createAddonsRouter());

  expressApp.use(globalErrorHandler);

  const server = http.createServer(expressApp);

  registerWebSocket({
    server,
    path: "/discovery",
    handleConnection: app.discovery.handleWebSocket
  });

  return server;
}
