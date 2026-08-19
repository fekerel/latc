export class UpnpAvTransportControlStrategy {
  static kind = "upnp-avtransport";
  static label = "UPnP AVTransport";
  static defaultConfig = {};

  constructor(config = {}) {
    this.config = config;
  }

  async play() {
    throw new Error("not_implemented");
  }
}
