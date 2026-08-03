import { sendSocketJson } from "../common/websocket.js";

export class DiscoveryWebSocketHandler {
  constructor({ subscribe }) {
    this.subscribe = subscribe;
  }

  async handle(socket) {
    let unsubscribe;
    let closed = false;
    let unsubscribed = false;

    const cleanup = () => {
      closed = true;

      if (!unsubscribe || unsubscribed) {
        return;
      }

      unsubscribed = true;
      unsubscribe();
    };

    socket.once("close", cleanup);
    socket.once("error", cleanup);

    try {
      unsubscribe = await this.subscribe((message) => {
        sendSocketJson(socket, message);
      });

      if (closed) {
        cleanup();
      }
    } catch (error) {
      cleanup();
      sendSocketJson(socket, { type: "error", message: error.message });
      socket.close();
    }
  }
}
