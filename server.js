import { createApp } from "./src/app.js";
import { createLanPublicBaseUrl } from "./src/common/network.js";
import { createServer } from "./src/http/server.js";
import { createStreamingServiceProxyServer } from "./src/http/streaming-service-proxy-server.js";

const PORT = Number(process.env.PORT ?? 3000);
const STREAMING_SERVICE_PROXY_PORT = Number(
  process.env.STREAMING_SERVICE_PROXY_PORT ?? 3001
);
const STREAMING_SERVICE_UPSTREAM_URL =
  process.env.STREAMING_SERVICE_UPSTREAM_URL ?? "http://127.0.0.1:11470";
const STREMIO_WEB_DIST_DIR = process.env.STREMIO_WEB_DIST_DIR;
const app = createApp({
  playback: {
    getPublicBaseUrl: () => 
      createLanPublicBaseUrl({
        port: PORT
      })
  },
  addonProxies: {
    getPublicBaseUrl: () => 
      createLanPublicBaseUrl({
        port: PORT
      })
  }
});
const server = createServer(app, {
  web: {
    stremioWebDistDir: STREMIO_WEB_DIST_DIR
  }
});
const streamingServiceProxyServer = createStreamingServiceProxyServer({
  upstreamBaseUrl: STREAMING_SERVICE_UPSTREAM_URL
});

app.discovery.onError((error) => {
  console.error("Discovery error:", error);
});

server.listen(PORT, () => {
  console.log(`HTTP server: http://localhost:${PORT}`);
  console.log(`Discovery WS: ws://localhost:${PORT}/discovery`);
  console.log(`LAN HTTP server: ${createLanPublicBaseUrl({port: PORT})}`);

  if (STREMIO_WEB_DIST_DIR) {
    console.log(`Stremio Web static files: ${STREMIO_WEB_DIST_DIR}`);
    console.log(`Stremio Web URL: ${createLanPublicBaseUrl({port: PORT})}/web`);
  }
});

streamingServiceProxyServer.listen(STREAMING_SERVICE_PROXY_PORT, () => {
  console.log(
    `Streaming service proxy: http://localhost:${STREAMING_SERVICE_PROXY_PORT}`
  );
  console.log(
    `LAN streaming service proxy: ${createLanPublicBaseUrl({
      port: STREAMING_SERVICE_PROXY_PORT
    })}`
  );
  console.log(`Streaming service upstream: ${STREAMING_SERVICE_UPSTREAM_URL}`);
});
