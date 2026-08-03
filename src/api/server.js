import http from "node:http";
import { registerWebSocket } from "./websocket.js";

export function createServer(app) {
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.url === "/discovery/devices") {
      sendJson(response, 200, { devices: app.discovery.listDevices() });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });

  registerWebSocket({
    server,
    path: "/discovery",
    handleConnection: app.discovery.handleWebSocket
  });

  return server;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
