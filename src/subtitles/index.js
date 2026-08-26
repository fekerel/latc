import { SubtitleDiscoveryService } from "./subtitle-discovery-service.js";

export function createSubtitlesModule(options = {}) {
  const service = new SubtitleDiscoveryService(options);

  return {
    discover: service.discover.bind(service)
  };
}
