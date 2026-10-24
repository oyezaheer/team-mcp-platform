
import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";

const TRUSTED_KUBERNETES_HOSTS = new Set([
  "inventory-mcp",
  "woocommerce-mcp",
  "support-mcp",
  "wordpress",
  "mariadb",
  "postgres",
]);

export async function validateUpstreamUrl(value: string): Promise<URL> {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Upstream URL must use HTTP or HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Upstream URL must not contain embedded credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Upstream hostname is not allowed");
  }

  // Allow only explicitly trusted Kubernetes service names.
  // Do not allow arbitrary private IP addresses.
  if (TRUSTED_KUBERNETES_HOSTS.has(hostname)) {
    if (url.protocol !== "http:") {
      throw new Error("Internal Kubernetes services must use HTTP");
    }
    return url;
  }

  // Reject non-public IP literals.
  if (ipaddr.isValid(hostname)) {
    const address = ipaddr.parse(hostname);
    if (address.range() !== "unicast") {
      throw new Error("Upstream IP address must be publicly routable");
    }
    return url;
  }

  // Resolve all DNS answers and reject any non-public address.
  let addresses: Awaited<ReturnType<typeof lookup>>[];

  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Upstream hostname could not be resolved");
  }

  if (addresses.length === 0) {
    throw new Error("Upstream hostname could not be resolved");
  }

  for (const entry of addresses) {
    const address = ipaddr.parse(entry.address);

    if (address.range() !== "unicast") {
      throw new Error(
        "Upstream hostname resolves to a non-public IP address"
      );
    }
  }

  return url;
}
