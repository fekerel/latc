import { networkInterfaces } from "node:os";

export function createLanPublicBaseUrl(options = {}) {
  const protocol = options.protocol ?? "http";
  const port = options.port;
  const host = options.host ?? findLanIpv4Address(options.interfaces);

  return `${protocol}://${host}:${port}`;
}

export function findLanIpv4Address(interfaces = networkInterfaces()) {
  const addresses = Object.values(interfaces)
    .flat()
    .filter(Boolean)
    .filter((address) => address.family === "IPv4" && !address.internal);

  return (
    addresses.find((address) => isPrivateIpv4Address(address.address))
      ?.address ??
    addresses[0]?.address ??
    "localhost"
  );
}

function isPrivateIpv4Address(address) {
  return (
    address.startsWith("192.168.")
  );
}