import assert from "node:assert/strict";
import { test } from "node:test";
import { UpnpAvTransportControlStrategy } from "../src/playback/control/strategies/upnp-avtransport-control-strategy.js";

test("adds external srt subtitle metadata to SetAVTransportURI", async () => {
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
        contentType: "video/mp4",
        contentLength: "123"
      },
      source: {
        subtitles: [
          {
            deliveryUrl: "http://latc.test/playback/subtitles/session-1/default.srt",
            format: "srt",
            language: "tr",
            label: "Turkish"
          }
        ]
      }
    },
    streamUrl: "http://latc.test/playback/streams/session-1"
  });

  const setUriCall = calls.find(
    (call) => call.actionName === "SetAVTransportURI"
  );

  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /<sec:CaptionInfoEx sec:type="srt" sec:lang="tr" sec:captionLang="tr" dc:language="tr" lang="tr" xml:lang="tr" sec:label="Turkish" sec:name="Turkish" name="Turkish" title="Turkish">http:\/\/latc\.test\/playback\/subtitles\/session-1\/default\.srt<\/sec:CaptionInfoEx>/
  );
  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /<sec:CaptionInfo sec:type="srt" sec:lang="tr" sec:captionLang="tr" dc:language="tr" lang="tr" xml:lang="tr" sec:label="Turkish" sec:name="Turkish" name="Turkish" title="Turkish">http:\/\/latc\.test\/playback\/subtitles\/session-1\/default\.srt<\/sec:CaptionInfo>/
  );
  assert.match(
    setUriCall.params.CurrentURIMetaData,
    /<res protocolInfo="http-get:\*:application\/x-subrip:\*" sec:type="srt" sec:lang="tr" sec:captionLang="tr" dc:language="tr" lang="tr" xml:lang="tr" sec:label="Turkish" sec:name="Turkish" name="Turkish" title="Turkish">http:\/\/latc\.test\/playback\/subtitles\/session-1\/default\.srt<\/res>/
  );
});
