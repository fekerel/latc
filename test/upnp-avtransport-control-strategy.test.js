import assert from "node:assert/strict";
import { test } from "node:test";
import { UpnpAvTransportControlStrategy } from "../src/playback/control/strategies/upnp-avtransport-control-strategy.js";

test("uses prepared media resource DLNA features in SetAVTransportURI metadata", async () => {
  const calls = [];

  class FakeMediaRendererClient {
    constructor(location) {
      this.location = location;
      this.instanceId = 0;
    }

    callAction(serviceId, actionName, params, callback) {
      calls.push({
        serviceId,
        actionName,
        params
      });
      callback(null, {});
    }
  }

  const strategy = new UpnpAvTransportControlStrategy(
    {
      playDelayMs: 0
    },
    {
      MediaRendererClient: FakeMediaRendererClient,
      getDeviceById() {
        return {
          services: new Map([
            [
              "device-key-1",
              {
                serviceType: "urn:schemas-upnp-org:service:AVTransport:1",
                location: "http://tv.test/AVTransport"
              }
            ]
          ])
        };
      }
    }
  );

  await strategy.play({
    session: {
      deviceRegistryId: "device-1",
      deviceKey: "device-key-1",
      mediaResource: {
        video: {
          contentType: "video/mp4",
          contentLength: "123",
          dlnaFeatures:
            "DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01500000000000000000000000000000"
        },
        subtitle: {
          contentType: "application/x-subrip; charset=utf-8",
          language: "eng"
        }
      }
    },
    streamUrl: "http://latc.test/playback/files/session-1/video",
    subtitleUrl: "http://latc.test/playback/files/session-1/subtitle"
  });

  const setUriCall = calls.find(
    (call) => call.actionName === "SetAVTransportURI"
  );

  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /protocolInfo="http-get:\*:video\/mp4:DLNA\.ORG_OP=00;DLNA\.ORG_FLAGS=01500000000000000000000000000000"/
  );
  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /<sec:CaptionInfoEx sec:type="srt" sec:lang="eng" dc:language="eng" lang="eng" xml:lang="eng">http:\/\/latc\.test\/playback\/files\/session-1\/subtitle<\/sec:CaptionInfoEx>/
  );
  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /<res protocolInfo="http-get:\*:application\/x-subrip:\*" sec:type="srt" sec:lang="eng" dc:language="eng" lang="eng" xml:lang="eng">http:\/\/latc\.test\/playback\/files\/session-1\/subtitle<\/res>/
  );
});
