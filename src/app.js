import { createAddonProxiesModule } from "./addon-proxies/index.js";
import { createDiscoveryModule } from "./discovery/index.js";
import { createPlaybackModule } from "./playback/index.js";
import { createPreviewModule } from "./preview/index.js";
import { createSubtitlesModule } from "./subtitles/index.js";

export function createApp(config = {}) {
  const discovery = createDiscoveryModule(config.discovery);
  const addonProxies = createAddonProxiesModule({
    ...config.addonProxies
  });
  const subtitles = createSubtitlesModule({
    ...config.subtitles
  });
  const preview = createPreviewModule({
    ...config.preview
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
    playback,
    preview,
    subtitles
  };
}
