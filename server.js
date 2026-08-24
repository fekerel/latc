import { createApp } from "./src/app.js";
import { createLanPublicBaseUrl } from "./src/common/network.js";
import { createServer } from "./src/http/server.js";

const PORT = Number(process.env.PORT ?? 3000);
const STREMIO_WEB_DIST_DIR = process.env.STREMIO_WEB_DIST_DIR;
const app = createApp({
  playback: {
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
