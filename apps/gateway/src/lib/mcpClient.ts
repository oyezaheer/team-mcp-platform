
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Connect a short-lived MCP client to an upstream server.
 * Pass `credential` to send it as a Bearer token in the Authorization header.
 * The caller is responsible for calling client.close() and transport.close().
 */
export async function connectMcpClient(
  url: string,
  credential?: string | null,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const client = new Client({
    name: "team-mcp-gateway",
    version: "1.0.0",
  });

  const headers: Record<string, string> = {};
  if (credential) {
    headers["Authorization"] = `Bearer ${credential}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  });

  // Wrap connect in a timeout so a dead upstream doesn't block forever.
  await Promise.race([
    client.connect(transport),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Upstream connect timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);

  return { client, transport };
}
