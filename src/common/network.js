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
    addresses.find((address) => isPreferredPrivateIpv4Address(address.address))
      ?.address ??
    addresses.find((address) => isPrivateIpv4Address(address.address))
      ?.address ??
    addresses[0]?.address ??
    "localhost"
  );
}

function isPreferredPrivateIpv4Address(address) {
  return address.startsWith("192.168.");
}

function isPrivateIpv4Address(address) {
  const octets = parseIpv4Octets(address);

  if (octets == null) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    isPreferredPrivateIpv4Address(address)
  );
}

function parseIpv4Octets(address) {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));

  if (
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
    )
  ) {
    return null;
  }

  return octets;
}
