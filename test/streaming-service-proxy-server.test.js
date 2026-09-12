import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createStreamingServiceProxyServer } from "../src/http/streaming-service-proxy-server.js";

test("proxies every request path to the streaming service", async () => {
  const upstreamRequests = [];
  const upstreamServer = http.createServer((request, response) => {
    upstreamRequests.push({
      method: request.method,
      url: request.url,
      headers: request.headers
    });

    response.writeHead(206, {
      "content-range": "bytes 0-10/11",
      "content-type": "video/mp4"
    });
    response.write("hello ");
    response.end("world");
  });
  await listen(upstreamServer);

  const proxyServer = createStreamingServiceProxyServer({
    upstreamBaseUrl: getServerBaseUrl(upstreamServer)
  });
  await listen(proxyServer);

  try {
    const response = await fetch(
      `${getServerBaseUrl(proxyServer)}/hlsv2/probe?mediaURL=http%3A%2F%2Fexample.test%2Fvideo.mp4`,
      {
        headers: {
          range: "bytes=0-10",
          "user-agent": "latc-test"
        }
      }
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("content-range"), "bytes 0-10/11");
    assert.equal(await response.text(), "hello world");
    assert.equal(
      upstreamRequests[0].url,
      "/hlsv2/probe?mediaURL=http%3A%2F%2Fexample.test%2Fvideo.mp4"
    );
    assert.equal(
      upstreamRequests[0].headers.host,
      new URL(getServerBaseUrl(upstreamServer)).host
    );
    assert.equal(upstreamRequests[0].headers.range, "bytes=0-10");
  } finally {
    await close(proxyServer);
    await close(upstreamServer);
  }
});

test("streams request bodies to the streaming service", async () => {
  let upstreamBody = "";
  const upstreamServer = http.createServer(async (request, response) => {
    for await (const chunk of request) {
      upstreamBody += chunk;
    }

    response.writeHead(201, {
      "content-type": "text/plain"
    });
    response.end("created");
  });
  await listen(upstreamServer);

  const proxyServer = createStreamingServiceProxyServer({
    upstreamBaseUrl: getServerBaseUrl(upstreamServer)
  });
  await listen(proxyServer);

  try {
    const response = await fetch(`${getServerBaseUrl(proxyServer)}/events`, {
      method: "POST",
      body: "event-body"
    });

    assert.equal(response.status, 201);
    assert.equal(await response.text(), "created");
    assert.equal(upstreamBody, "event-body");
  } finally {
    await close(proxyServer);
    await close(upstreamServer);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getServerBaseUrl(server) {
  const address = server.address();

  return `http://${address.address}:${address.port}`;
}
