import { createAddonProxiesModule } from "./addon-proxies/index.js";
import { createDiscoveryModule } from "./discovery/index.js";
import { createPlaybackModule } from "./playback/index.js";

export function createApp(config = {}) {
  const discovery = createDiscoveryModule(config.discovery);
  const addonProxies = createAddonProxiesModule({
    ...config.addonProxies
  });
  const playback = createPlaybackModule({
    ...config.playback,
    control: {
      ...config.playback?.control,
      getDeviceById: discovery.getDeviceById
    },
    resolveDeviceIdentifier: discovery.resolveDeviceIdentifier
  });

  return {
    addonProxies,
    discovery,
    playback
  };
}
