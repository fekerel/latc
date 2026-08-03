import { createServer } from "./src/api/server.js";
import { createApp } from "./src/app.js";

const PORT = Number(process.env.PORT ?? 3000);
const app = createApp();
const server = createServer(app);

app.discovery.onError((error) => {
  console.error("Discovery error:", error);
});

server.listen(PORT, () => {
  console.log(`HTTP server: http://localhost:${PORT}`);
  console.log(`Discovery WS: ws://localhost:${PORT}/discovery`);
});
