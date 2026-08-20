import { createControlStrategyRegistry } from "./control/index.js";
import { createDeliveryStrategyRegistry } from "./delivery/index.js";
import { createDeviceProfilesModule } from "./device-profiles/index.js";
import { PlaybackService } from "./playback-service.js";
import { PlaybackSessionStore } from "./playback-session-store.js";

export function createPlaybackModule(options = {}) {
  const controlStrategyRegistry = createControlStrategyRegistry(
    options.control
  );
  const deliveryStrategyRegistry = createDeliveryStrategyRegistry(
    options.delivery
  );
  const deviceProfiles = createDeviceProfilesModule({
    ...options.deviceProfiles,
    controlStrategyRegistry,
    deliveryStrategyRegistry,
    resolveDeviceIdentifier: options.resolveDeviceIdentifier
  });
  const sessionStore = options.sessionStore ?? new PlaybackSessionStore();
  const service = new PlaybackService({
    deviceProfileService: deviceProfiles,
    controlStrategyRegistry,
    deliveryStrategyRegistry,
    sessionStore,
    getPublicBaseUrl: options.getPublicBaseUrl
  });

  return {
    deviceProfiles,
    createSession: service.createSession.bind(service),
    handleRequest: service.handleRequest.bind(service),
    getSession: sessionStore.getSession.bind(sessionStore),
    publicBaseUrl: service.publicBaseUrl
  };
}
