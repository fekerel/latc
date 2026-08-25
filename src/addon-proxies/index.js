import { AddonProxyService } from "./addon-proxy-service.js";

export function createAddonProxiesModule(options = {}) {
  const service = new AddonProxyService(options);

  return {
    createManifestProxyUrl: service.createManifestProxyUrl.bind(service),
    handleRequest: service.handleRequest.bind(service)
  };
}
