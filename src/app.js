import { createDiscoveryModule } from "./discovery/index.js";
import { createPlaybackModule } from "./playback/index.js";

export function createApp(config = {}) {
  const discovery = createDiscoveryModule(config.discovery);
  const playback = createPlaybackModule({
    ...config.playback,
    control: {
      ...config.playback?.control,
      getDeviceById: discovery.getDeviceById
    },
    resolveDeviceIdentifier: discovery.resolveDeviceIdentifier
  });

  return {
    discovery,
    playback
  };
}
