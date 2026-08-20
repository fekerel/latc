import { EventEmitter } from "node:events";
import { AppError } from "../common/errors/app-error.js";
import { PlaybackStartError } from "../common/errors/playback-start-error.js";

export class PlaybackSession extends EventEmitter {
  constructor({
    id,
    deviceRegistryId,
    deviceKey,
    source,
    control,
    delivery,
    controlStrategy,
    deliveryStrategy,
    createdAt = new Date()
  }) {
    super();

    this.id = id;
    this.deviceRegistryId = deviceRegistryId;
    this.deviceKey = deviceKey;
    this.source = source;
    this.control = control;
    this.delivery = delivery;
    this.controlStrategy = controlStrategy;
    this.deliveryStrategy = deliveryStrategy;
    this.createdAt = createdAt;
    this.mediaResource = {};
    this.closed = false;
    this.closeDetails = null;
  }

  patchMediaResource(partial = {}) {
    this.mediaResource = {
      ...this.mediaResource,
      ...structuredClone(partial)
    };
  }

  async start({ streamUrl }) {
    try {
      const mediaResource = await this.deliveryStrategy.prepare(this.source);
      this.patchMediaResource(mediaResource);

      await this.controlStrategy.play({
        session: this,
        streamUrl
      });  
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }  

      throw new PlaybackStartError(error.message, 502, {
        originalError: error
      });
    }
  }

  async requestClose(details = {}) {
    return this.close(details);
  }

  async close(details = {}) {
    if (this.closed) return;

    this.closed = true;
    this.closeDetails = details;

    await Promise.allSettled([
      this.deliveryStrategy.dispose?.(),
      this.controlStrategy.dispose?.()
    ]);

    this.emit("closed", { session: this, details });
  }
}
