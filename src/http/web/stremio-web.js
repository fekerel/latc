import express from "express";
import { Router } from "express";
import path from "node:path";

export function createStremioWebRouter(options = {}) {
  const distDir = options.distDir ?? options.stremioWebDistDir;
  const router = Router();

  if (!distDir) {
    return router;
  }

  const resolvedDistDir = path.resolve(distDir);

  router.use(express.static(resolvedDistDir));
  router.get(/.*/, (req, res, next) => {
    if (!acceptsHtml(req)) {
      next();
      return;
    }

    res.sendFile("index.html", { root: resolvedDistDir }, next);
  });

  return router;
}

function acceptsHtml(req) {
  return req.accepts("html") === "html";
}
