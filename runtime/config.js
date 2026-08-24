import fs from "node:fs";
import path from "node:path";
import { createLanPublicBaseUrl } from "../src/common/network.js";
import { getRuntimeDir, resolveRuntimePath } from "./paths.js";

export function createRuntimeConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  const runtimeDir = getRuntimeDir();
  const getPublicBaseUrl = () => createLanPublicBaseUrl({ port });

  return {
    port,
    runtimeDir,
    publicBaseUrl: getPublicBaseUrl(),
    app: {
      playback: {
        getPublicBaseUrl
      }
    },
    http: {
      web: {
        stremioWebDistDir: resolveStremioWebDistDir({ env, runtimeDir })
      }
    }
  };
}

function resolveStremioWebDistDir({ env, runtimeDir }) {
  if (env.STREMIO_WEB_DIST_DIR) {
    return path.resolve(runtimeDir, env.STREMIO_WEB_DIST_DIR);
  }

  const defaultDistDir = resolveRuntimePath("web", { runtimeDir });

  return fs.existsSync(defaultDistDir) ? defaultDistDir : undefined;
}
