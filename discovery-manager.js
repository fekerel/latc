import { EventEmitter } from "node:events";
import ssdp from "@achingbrain/ssdp";

export class DiscoveryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.searchInterval = options.searchInterval;
    this.bus = null;
    this.abortController = null;
    this.discoveryPromise = null;
    this.startingPromise = null;
    this.stoppingPromise = null;
  }

  get running() {
    return this.bus !== null;
  }

  async start() {
    if (this.bus) {
      return;
    }

    if (this.startingPromise) {
      await this.startingPromise;
      return;
    }

    if (this.stoppingPromise) {
      await this.stoppingPromise;
    }

    this.startingPromise = this.doStart();

    try {
      await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  async doStart() {
    this.abortController = new AbortController();

    try {
      this.bus = await ssdp({
        cache: false,
        sockets: [
          {
            type: "udp4",
            bind: {
              address: "0.0.0.0",
              port: 0
            }
          }
        ]
      });
    } catch (error) {
      this.abortController = null;
      this.bus = null;
      throw error;
    }

    this.bus.on("error", (error) => {
      this.emit("error", error);
    });

    this.discoveryPromise = this.discoverLoop().catch((error) => {
      if (error.name !== "AbortError") {
        this.emit("error", error);
      }
    });
  }

  async stop() {
    if (this.stoppingPromise) {
      return this.stoppingPromise;
    }

    this.stoppingPromise = this.doStop();

    try {
      return await this.stoppingPromise;
    } finally {
      this.stoppingPromise = null;
    }
  }

  async doStop() {
    if (this.startingPromise) {
      await this.startingPromise;
    }

    const bus = this.bus;

    if (!bus) {
      return;
    }

    this.abortController?.abort();
    this.abortController = null;
    this.bus = null;

    try {
      await this.discoveryPromise;
    } catch (error) {
      if (error.name !== "AbortError") {
        throw error;
      }
    } finally {
      this.discoveryPromise = null;
    }

    await bus.stop();
  }

  async discoverLoop() {
    for await (const service of this.bus.discover({
      searchInterval: this.searchInterval,
      signal: this.abortController.signal
    })) {
      this.emit("service", service);
    }
  }
}
