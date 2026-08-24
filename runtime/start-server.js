import { createApp } from "../src/app.js";
import { createServer } from "../src/http/server.js";
import { createRuntimeConfig } from "./config.js";

export async function startServer(options = {}) {
  const config = options.config ?? createRuntimeConfig(options.env);
  const app = createApp(config.app);
  const server = createServer(app, config.http);

  app.discovery.onError((error) => {
    console.error("Discovery error:", error);
  });

  await listen(server, config.port);
  logStartup(config);

  return {
    app,
    server,
    config
  };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function logStartup(config) {
  console.log(`HTTP server: http://localhost:${config.port}`);
  console.log(`Discovery WS: ws://localhost:${config.port}/ws/discovery`);
  console.log(`LAN HTTP server: ${config.publicBaseUrl}`);
  console.log(`Runtime dir: ${config.runtimeDir}`);

  if (config.http.web.stremioWebDistDir) {
    console.log(`Stremio Web static files: ${config.http.web.stremioWebDistDir}`);
    console.log(`Stremio Web URL: ${config.publicBaseUrl}/web`);
  }
}
