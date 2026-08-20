import MediaRendererClient from "upnp-mediarenderer-client";
import { normalizeContentType } from "../../../common/content-type.js";
import { createDefaultDlnaFeatures } from "../../../common/dlna.js";

export class UpnpAvTransportControlStrategy {
  static kind = "upnp-avtransport";
  static label = "UPnP AVTransport";
  static defaultConfig = {};

  constructor(config = {}, deps = {}) {
    this.config = config;
    this.getDeviceById = deps.getDeviceById;
    this.MediaRendererClient = deps.MediaRendererClient ?? MediaRendererClient;
    this.client = null;
  }

  async play({ session, streamUrl }) {
    const device = this.getDevice(session.deviceRegistryId);
    const { serviceIdentifier, service } = findAvTransportService(
      device,
      this.config.serviceIdentifier ?? session.deviceKey
    );
    const client = new this.MediaRendererClient(service.location);
    const loadOptions = createLoadOptions(this.config, session.mediaResource);

    this.client = client;
    await setAvTransportUri(client, streamUrl, loadOptions);
    await wait(this.config.playDelayMs ?? 500);
    await play(client);

    return {
      status: "playing_requested",
      streamUrl,
      serviceIdentifier,
      rendererLocation: service.location
    };
  }

  getDevice(deviceRegistryId) {
    if (!this.getDeviceById) {
      throw new TypeError("getDeviceById is required");
    }

    const device = this.getDeviceById(deviceRegistryId);

    if (!device) {
      throw new RangeError("device_not_found");
    }

    return device;
  }
}

function findAvTransportService(device, preferredServiceIdentifier) {
  if (preferredServiceIdentifier) {
    const service = device.services.get(preferredServiceIdentifier);

    if (service && isAvTransportService(service)) {
      return {
        serviceIdentifier: preferredServiceIdentifier,
        service
      };
    }
  }

  for (const [serviceIdentifier, service] of device.services) {
    if (isAvTransportService(service)) {
      return {
        serviceIdentifier,
        service
      };
    }
  }

  throw new RangeError("av_transport_service_not_found");
}

function isAvTransportService(service) {
  return String(service.serviceType)
    .split(":")
    .some((part) => part.toLowerCase() === "avtransport");
}

function createLoadOptions(config, mediaResource = {}) {
  const { serviceIdentifier, metadata, ...loadOptions } = config;

  return {
    autoplay: true,
    contentType: mediaResource.contentType,
    ...loadOptions,
    metadata: {
      size: mediaResource.contentLength,
      ...metadata
    }
  };
}

function setAvTransportUri(client, streamUrl, options) {
  const protocolInfo = createProtocolInfo(options);
  const metadata = createMetadata({
    ...options.metadata,
    url: streamUrl,
    protocolInfo
  });

  return callAction(client, "AVTransport", "SetAVTransportURI", {
    InstanceID: client.instanceId ?? 0,
    CurrentURI: streamUrl,
    CurrentURIMetaData: metadata
  });
}

function play(client) {
  return callAction(client, "AVTransport", "Play", {
    InstanceID: client.instanceId ?? 0,
    Speed: 1
  });
}

function wait(timeoutMs) {
  if (timeoutMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function callAction(client, serviceId, actionName, params) {
  return new Promise((resolve, reject) => {
    client.callAction(serviceId, actionName, params, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function createProtocolInfo(options) {
  const contentType = normalizeContentType(options.contentType) ?? "video/mpeg";
  const dlnaFeatures =
    options.dlnaFeatures ?? createDefaultDlnaFeatures(contentType);

  return `http-get:*:${contentType}:${dlnaFeatures}`;
}

function createMetadata(metadata) {
  const type = metadata.type ?? "video";
  const objectClassByType = {
    audio: "object.item.audioItem.musicTrack",
    video: "object.item.videoItem.movie",
    image: "object.item.imageItem.photo"
  };

  return [
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:sec="http://www.sec.co.kr/">',
    '<item id="0" parentID="-1" restricted="false">',
    `<upnp:class>${escapeXml(objectClassByType[type])}</upnp:class>`,
    metadata.title ? `<dc:title>${escapeXml(metadata.title)}</dc:title>` : "",
    metadata.creator
      ? `<dc:creator>${escapeXml(metadata.creator)}</dc:creator>`
      : "",
    createResourceElement(metadata),
    "</item>",
    "</DIDL-Lite>"
  ].join("");
}

function createResourceElement(metadata) {
  const attributes = [
    `protocolInfo="${escapeXml(metadata.protocolInfo)}"`
  ];

  if (metadata.size) {
    attributes.push(`size="${escapeXml(metadata.size)}"`);
  }

  return `<res ${attributes.join(" ")}>${escapeXml(metadata.url)}</res>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
