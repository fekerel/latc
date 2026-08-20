import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { DeviceNotFoundError } from "../common/errors/device-not-found-error.js";
import { UnsupportedDeviceError } from "../common/errors/unsupported-device-error.js";

export class DiscoveryCoordinator extends EventEmitter {
  constructor(discoveryManager, deviceRegistry, options = {}) {
    super();

    this.currentRunId = null;
    this.discoveryManager = discoveryManager;
    this.deviceRegistry = deviceRegistry;
    this.stopGraceMs = options.stopGraceMs ?? 5000;
    this.subscribers = new Set();
    this.discoveryUsers = new Set();
    this.stopTimer = null;
    this.startingSessionPromise = null;

    this.discoveryManager.on("service", ({ runId, service }) => {
      if (runId !== this.currentRunId) {
        return;
      }

      this.deviceRegistry.addService(service, runId);
    });

    this.discoveryManager.on("error", (error) => {
      this.emit("error", error);
    });

    this.deviceRegistry.on("device:added", ({ runId, device }) => {
      if (runId !== this.currentRunId) {
        return;
      }

      this.broadcast({
        type: "device.added",
        device
      });
    });

    this.deviceRegistry.on("device:updated", ({ runId, device }) => {
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
    const releaseDiscovery = await this.acquireDiscovery();

    try {
      this.subscribers.add(listener);

      listener({
        type: "snapshot",
        devices: this.listDevices()
      });
    } catch (error) {
      this.subscribers.delete(listener);
      releaseDiscovery();
      throw error;
    }

    let unsubscribed = false;

    return () => {
      if (unsubscribed) {
        return;
      }

      unsubscribed = true;
      this.subscribers.delete(listener);
      releaseDiscovery();
    };
  }

  async acquireDiscovery() {
    const token = Symbol("discovery-user");
    this.discoveryUsers.add(token);
    this.clearStopTimer();

    try {
      await this.ensureDiscoverySession();
    } catch (error) {
      this.releaseDiscovery(token);
      throw error;
    }

    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      this.releaseDiscovery(token);
    };
  }

  releaseDiscovery(token) {
    if (!this.discoveryUsers.delete(token)) {
      return;
    }

    if (this.discoveryUsers.size === 0 && this.discoveryManager.running) {
      this.scheduleStop();
    }
  }

  listDevices() {
    if (!this.currentRunId) {
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
      await this.discoveryManager.start(runId);
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
    if (this.discoveryUsers.size > 0) {
      return;
    }

    this.clearStopTimer();

    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;

      if (this.discoveryUsers.size > 0) {
        return;
      }

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

  async resolveDeviceIdentifier(deviceRegistryId, options = {}) {
    const timeoutMs = options.timeoutMs ?? 3000;
    let device = this.deviceRegistry.getDeviceById(deviceRegistryId);

    if (!device) {
      throw new DeviceNotFoundError();
    }

    let identifier = getDeviceIdentifier(device);

    if (identifier) {
      return identifier;
    }

    const releaseDiscovery = await this.acquireDiscovery();

    try {
      await wait(timeoutMs);
      device = this.deviceRegistry.getDeviceById(deviceRegistryId);

      if (!device) {
        throw new DeviceNotFoundError();
      }

      identifier = getDeviceIdentifier(device);

      if (!identifier) {
        throw new UnsupportedDeviceError()
      }

      return identifier;
    } finally {
      releaseDiscovery();
    }
  }
}

function getDeviceIdentifier(device) {
  if (!device) {
    return undefined;
  }

  for (const [usn, service] of device.services) {
    if (isAvTransportService(service)) {
      return usn;
    }
  }

  return undefined;
}

function isAvTransportService(service) {
  return String(service.serviceType)
    .split(":")
    .some((part) => part.toLowerCase() === "avtransport");
}

function wait(timeoutMs) {
  if (timeoutMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}
