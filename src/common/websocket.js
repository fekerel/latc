import WebSocket from "ws";

export function sendSocketJson(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}
