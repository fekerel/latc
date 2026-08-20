import { EventEmitter } from "node:events";
import ssdp from "@achingbrain/ssdp";
import { findLanIpv4Address } from "../common/network.js";

export class DiscoveryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.searchInterval = options.searchInterval;
    this.findLanIpv4Address =
      options.findLanIpv4Address ?? findLanIpv4Address;
    this.bus = null;
    this.abortController = null;
    this.discoveryPromise = null;
    this.startingPromise = null;
    this.stoppingPromise = null;
  }

  get running() {
    return this.bus !== null;
  }

  async start(runId) {
    if (!runId) {
      throw new TypeError("runId is required");
    }

    while (true) {
      if (this.bus) {
        return;
      }

      if (this.startingPromise) {
        await this.startingPromise;
        return;
      }

      if (!this.stoppingPromise) {
        break;
      }

      await this.stoppingPromise;
    }

    const startingPromise = this.doStart(runId);
    this.startingPromise = startingPromise;

    try {
      await startingPromise;
    } finally {
      if (this.startingPromise === startingPromise) {
        this.startingPromise = null;
      }
    }
  }

  async doStart(runId) {
    const abortController = new AbortController();
    let bus;

    this.abortController = abortController;

    try {
      const bindAddress = this.findLanIpv4Address();

      bus = await ssdp({
        sockets: [
          {
            type: "udp4",
            bind: {
              address: bindAddress === "localhost" ? "0.0.0.0" : bindAddress,
              port: 0
            }
          }
        ]
      });
      this.bus = bus;
    } catch (error) {
      this.abortController = null;
      this.bus = null;
      throw error;
    }

    bus.on("error", (error) => {
      this.emit("error", error);
    });

    bus.on("service:update", (service) => {
      this.emit("service", {
        runId,
        service
      });
    });

    this.discoveryPromise = this.discoverLoop(
      bus,
      abortController.signal,
      runId
    ).catch((error) => {
      if (error.name !== "AbortError") {
        this.emit("error", error);
      }
    });
  }

  async stop() {
    if (this.stoppingPromise) {
      return this.stoppingPromise;
    }

    const stoppingPromise = this.doStop();
    this.stoppingPromise = stoppingPromise;

    try {
      return await stoppingPromise;
    } finally {
      if (this.stoppingPromise === stoppingPromise)
        this.stoppingPromise = null;
    }
  }

  async doStop() {
    if (this.startingPromise) {
      await this.startingPromise;
    }

    const bus = this.bus;
    const abortController = this.abortController;
    const discoveryPromise = this.discoveryPromise;

    if (!bus) {
      return;
    }

    abortController?.abort();
    this.abortController = null;
    this.bus = null;

    try {
      await discoveryPromise;
    } catch (error) {
      if (error.name !== "AbortError") {
        throw error;
      }
    } finally {
      if (this.discoveryPromise === discoveryPromise) {
        this.discoveryPromise = null;
      }
    }

    await bus.stop();
  }

  async discoverLoop(bus, signal, runId) {
    for await (const service of bus.discover({
      searchInterval: this.searchInterval,
      signal
    })) {
      this.emit("service", {
        runId,
        service
      });
    }
  }
}
