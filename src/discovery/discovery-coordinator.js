import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export class DiscoveryCoordinator extends EventEmitter {
  constructor(discoveryManager, deviceRegistry, options = {}) {
    super();

    this.currentRunId = null;
    this.discoveryManager = discoveryManager;
    this.deviceRegistry = deviceRegistry;
    this.stopGraceMs = options.stopGraceMs ?? 5000;
    this.subscribers = new Set();
    this.stopTimer = null;
    this.startingSessionPromise = null;

    this.discoveryManager.on("service", (service) => {
      if (!this.currentRunId) {
        return;
      }

      this.deviceRegistry.addService(service, this.currentRunId);
    });

    this.discoveryManager.on("error", (error) => {
      this.emit("error", error);
    });

    this.deviceRegistry.on("device:added", ({runId, device}) => {
      if (runId !== this.currentRunId) {
        return;
      }

      this.broadcast({
        type: "device.added",
        device
      });
    });

    this.deviceRegistry.on("device:updated", ({runId, device}) => {
      if (runId !== this.currentRunId) {
        return;
      }

      this.broadcast({
        type: "device.updated",
        device
      });
    });
  }

  async subscribe(listener) {
    this.clearStopTimer();
    await this.ensureDiscoverySession();

    this.subscribers.add(listener);

    listener({
      type: "snapshot",
      devices: this.listDevices()
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
    if(!this.currentRunId) {
      return [];
    }

    return this.deviceRegistry.listDevices(this.currentRunId);
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
    const previousRunId = this.currentRunId;
    const runId = randomUUID();

    this.currentRunId = runId;

    try {
      await this.discoveryManager.start();
    } catch (error) {
      if (this.currentRunId === runId) {
        this.currentRunId = previousRunId;
      }

      throw error;
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
