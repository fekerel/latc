import { EventEmitter } from "node:events";

export class DiscoveryCoordinator extends EventEmitter {
  constructor(discoveryManager, deviceRegistry, options = {}) {
    super();

    this.discoveryManager = discoveryManager;
    this.deviceRegistry = deviceRegistry;
    this.stopGraceMs = options.stopGraceMs ?? 5000;
    this.subscribers = new Set();
    this.stopTimer = null;

    this.discoveryManager.on("service", (service) => {
      this.deviceRegistry.addService(service);
    });

    this.discoveryManager.on("error", (error) => {
      this.emit("error", error);
    });

    this.deviceRegistry.on("device", (device) => {
      this.broadcast({
        type: "device",
        device
      });
    });
  }

  async subscribe(listener) {
    this.clearStopTimer();

    if (!this.discoveryManager.running) {
      this.deviceRegistry.clear();
      await this.discoveryManager.start();
    }

    this.subscribers.add(listener);

    listener({
      type: "snapshot",
      devices: this.deviceRegistry.listDevices()
    });

    return () => {
      this.unsubscribe(listener);
    };
  }

  unsubscribe(listener) {
    this.subscribers.delete(listener);

    if (this.subscribers.size === 0) {
      this.scheduleStop();
    }
  }

  broadcast(message) {
    for (const listener of this.subscribers) {
      listener(message);
    }
  }

  scheduleStop() {
    this.clearStopTimer();

    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.discoveryManager.stop().catch((error) => {
        this.emit("error", error);
      });
    }, this.stopGraceMs);
  }

  clearStopTimer() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }
}
