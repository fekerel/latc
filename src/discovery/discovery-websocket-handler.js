import { sendSocketJson } from "../common/websocket.js";

export class DiscoveryWebSocketHandler {
  constructor({ subscribe }) {
    this.subscribe = subscribe;
  }

  async handle(socket) {
    let unsubscribe = () => {};
    let unsubscribed = false;

    const unsubscribeOnce = () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      unsubscribe();
    };

    try {
      unsubscribe = await this.subscribe((message) => {
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

    socket.on("close", unsubscribeOnce);
    socket.on("error", unsubscribeOnce);
  }
}
