import { WebSocketServer } from "ws";

export function registerWebSocket({ server, path, handleConnection }) {
  const websocketServer = new WebSocketServer({
    server,
    path
  });

  websocketServer.on("connection", (socket, request) => {
    handleConnection(socket, request);
  });

  return websocketServer;
}
