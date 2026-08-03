import http from "node:http";
import { WebSocketServer } from "ws";
import { DiscoveryCoordinator } from "./discovery-coordinator.js";
import { DiscoveryManager } from "./discovery-manager.js";
import { DeviceRegistry } from "./device-registry.js";

const PORT = Number(process.env.PORT ?? 3000);

const discoveryManager = new DiscoveryManager({
  searchInterval: 5000
});
const deviceRegistry = new DeviceRegistry();
const coordinator = new DiscoveryCoordinator(discoveryManager, deviceRegistry);

coordinator.on("error", (error) => {
  console.error("Discovery error:", error);
});

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({
  server,
  path: "/discovery"
});

wss.on("connection", async (socket) => {
  let unsubscribe = () => {};

  try {
    unsubscribe = await coordinator.subscribe((message) => {
      sendJson(socket, message);
    });
  } catch (error) {
    sendJson(socket, {
      type: "error",
      message: error.message
    });
    socket.close();
    return;
  }

  socket.on("close", () => {
    unsubscribe();
  });

  socket.on("error", () => {
    unsubscribe();
  });
});

server.listen(PORT, () => {
  console.log(`HTTP server: http://localhost:${PORT}`);
  console.log(`Discovery WS: ws://localhost:${PORT}/discovery`);
});

function sendJson(socket, message) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}
