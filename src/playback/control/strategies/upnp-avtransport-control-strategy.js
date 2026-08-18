export class UpnpAvTransportControlStrategy {
  kind = "upnp-avtransport";
  label = "UPnP AVTransport";
  defaultConfig = {};

  async play() {
    throw new Error("not_implemented");
  }
}
