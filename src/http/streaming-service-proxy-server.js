import express from "express";
import http from "node:http";
import { globalErrorHandler } from "./middleware/global-error-handler.js";
import { createStreamingServiceProxyRouter } from "./proxy/streaming-service-proxy.js";

function allowAllCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "*"
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

export function createStreamingServiceProxyServer(options = {}) {
  const expressApp = express();

  expressApp.use(allowAllCors);
  expressApp.use(createStreamingServiceProxyRouter(options));
  expressApp.use(globalErrorHandler);

  return http.createServer(expressApp);
}
