
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { validateUpstreamUrl } from "./upstreamUrl.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function connectMcpClient(
  url: string,
  credential?: string | null,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const client = new Client({
    name: "team-mcp-gateway",
    version: "1.0.0",
  });
  const validatedUrl = validateUpstreamUrl(url);

  const headers: Record<string, string> = {};
  if (credential) {
    headers.Authorization = `Bearer ${credential}`;
  }

  // Apply a timeout to each outgoing upstream HTTP request.
  const timedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Preserve cancellation requested by the SDK or caller.
    const upstreamSignal = init?.signal;
    const abortFromUpstream = () => controller.abort();

    if (upstreamSignal?.aborted) {
      controller.abort();
    } else {
      upstreamSignal?.addEventListener("abort", abortFromUpstream, {
        once: true,
      });
    }

    try {
      return await fetch(input, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };

  const transport = new StreamableHTTPClientTransport(await validatedUrl, {
    requestInit: { headers },
    fetch: timedFetch,
  });

  try {
    await client.connect(transport);
    return { client, transport };
  } catch (error) {
    await Promise.allSettled([client.close(), transport.close()]);
    throw error;
  }
}
