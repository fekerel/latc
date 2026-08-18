import express from "express";
import http from "node:http";
import { registerWebSocket } from "./websocket.js";
import { createDiscoveryRouter } from "./routers/discovery-router.js";
import { createDeviceProfileRouter } from "./routers/device-profile-router.js";

export function createServer(app) {
  const expressApp = express();

  expressApp.use(express.json());

  expressApp.use("/discovery", createDiscoveryRouter(app.discovery));
  expressApp.use("/device-profiles", createDeviceProfileRouter(app.playback.deviceProfiles));

  const server = http.createServer(expressApp);

  registerWebSocket({
    server,
    path: "/discovery",
    handleConnection: app.discovery.handleWebSocket
  });

  return server;
}
