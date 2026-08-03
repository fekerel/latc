import http from "node:http";
import { WebSocketServer } from "ws";

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

  const discoveryWebSocket = new WebSocketServer({
    server,
    path: "/discovery"
  });

  discoveryWebSocket.on("connection", async (socket) => {
    let unsubscribe = () => {};

    try {
      unsubscribe = await app.discovery.subscribe((message) => {
        sendSocketJson(socket, message);
      });
    } catch (error) {
      sendSocketJson(socket, {
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

  return server;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function sendSocketJson(socket, message) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}
