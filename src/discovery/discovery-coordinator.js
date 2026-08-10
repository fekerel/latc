import { EventEmitter } from "node:events";

export class DiscoveryCoordinator extends EventEmitter {
  constructor(discoveryManager, deviceRegistry, options = {}) {
    super();

    this.discoveryManager = discoveryManager;
    this.deviceRegistry = deviceRegistry;
    this.stopGraceMs = options.stopGraceMs ?? 5000;
    this.subscribers = new Set();
    this.stopTimer = null;
    this.startingSessionPromise = null;

    this.discoveryManager.on("service", (service) => {
      this.deviceRegistry.addService(service);
    });

    this.discoveryManager.on("service:remove", (usn) => {
      this.deviceRegistry.removeService(usn);
    });

    this.discoveryManager.on("error", (error) => {
      this.emit("error", error);
    });

    this.deviceRegistry.on("device:added", (device) => {
      this.broadcast({
        type: "device.added",
        device
      });
    });

    this.deviceRegistry.on("device:updated", (device) => {
      this.broadcast({
        type: "device.updated",
        device
      });
    });

    this.deviceRegistry.on("device:removed", ({ deviceId, reason }) => {
      this.broadcast({
        type: "device.removed",
        deviceId,
        reason
      });
    });
  }

  async subscribe(listener) {
    this.clearStopTimer();
    await this.ensureDiscoverySession();

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

  listDevices() {
    return this.deviceRegistry.listDevices();
  }

  async ensureDiscoverySession() {
    if (this.discoveryManager.running) {
      return;
    }

    if (this.startingSessionPromise) {
      await this.startingSessionPromise;
      return;
    }

    const startingSessionPromise = this.startDiscoverySession();
    this.startingSessionPromise = startingSessionPromise;

    try {
      await startingSessionPromise;
    } finally {
      if (this.startingSessionPromise === startingSessionPromise) {
        this.startingSessionPromise = null;
      }
    }
  }

  async startDiscoverySession() {
    this.deviceRegistry.clear();
    await this.discoveryManager.start();
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
