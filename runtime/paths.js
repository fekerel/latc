import sea from "node:sea";
import path from "node:path";

export function getRuntimeDir() {
  if (sea.isSea()) {
    return path.dirname(process.execPath);
  }

  return process.cwd();
}

export function resolveRuntimePath(relativePath, options = {}) {
  const runtimeDir = options.runtimeDir ?? getRuntimeDir(options.env);

  return path.resolve(runtimeDir, relativePath);
}
