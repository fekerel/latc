import { createServer } from "./src/api/server.js";
import { createApp } from "./src/app.js";
import { createLanPublicBaseUrl } from "./src/common/network.js";

const PORT = Number(process.env.PORT ?? 3000);
const app = createApp({
  playback: {
    getPublicBaseUrl: () => 
      createLanPublicBaseUrl({
        port: PORT
      })
  }
});
const server = createServer(app);

app.discovery.onError((error) => {
  console.error("Discovery error:", error);
});

server.listen(PORT, () => {
  console.log(`HTTP server: http://localhost:${PORT}`);
  console.log(`Discovery WS: ws://localhost:${PORT}/discovery`);
  console.log(`LAN HTTP server: ${createLanPublicBaseUrl(PORT)}`);
});
