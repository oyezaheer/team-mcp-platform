
import { Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import prisma from "../lib/prisma.js";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { connectMcpClient } from "../lib/mcpClient.js";

const router = Router();

async function createGatewayServer(userId: string) {
  const server = new Server(
    {
      name: "team-mcp-gateway",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Discover tools from all enabled upstream MCP servers.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const upstreams = await prisma.upstream.findMany({
      where: { enabled: true },
    });

    const discoveredTools: any[] = [];

    await Promise.all(
      upstreams.map(async (upstream) => {
        try {
          const { client, transport } = await connectMcpClient(
            upstream.url,
            upstream.credential,
            10_000
          );

          try {
            const response = await client.listTools();

            for (const tool of response.tools) {
              discoveredTools.push({
                ...tool,
                // Namespace: upstreamId__toolName to avoid collisions
                name: `${upstream.id}__${tool.name}`,
                description: tool.description
                  ? `[${upstream.name}] ${tool.description}`
                  : `Tool from ${upstream.name}`,
              });
            }
          } finally {
            await client.close();
            await transport.close();
          }
        } catch (error) {
          console.error(
            `Could not discover tools from ${upstream.name}:`,
            (error as Error).message
          );
        }
      })
    );

    await prisma.auditLog.create({
      data: {
        userId,
        toolName: "mcp.tools.list",
        status: "SUCCESS",
        details: { toolCount: discoveredTools.length },
      },
    });

    return { tools: discoveredTools };
  });

  // Execute a tool through the appropriate upstream.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const gatewayToolName = request.params.name;
    const separator = gatewayToolName.indexOf("__");

    if (separator <= 0 || separator === gatewayToolName.length - 2) {
      return {
        content: [{ type: "text", text: "Invalid gateway tool name" }],
        isError: true,
      };
    }

    const upstreamId = gatewayToolName.slice(0, separator);
    const toolName = gatewayToolName.slice(separator + 2);

    const upstream = await prisma.upstream.findFirst({
      where: {
        id: upstreamId,
        enabled: true,
      },
    });

    if (!upstream) {
      return {
        content: [
          {
            type: "text",
            text: "Upstream not found or is disabled",
          },
        ],
        isError: true,
      };
    }

    const startMs = Date.now();

    try {
      const { client, transport } = await connectMcpClient(
        upstream.url,
        upstream.credential,
        15_000
      );

      let result;

      try {
        result = await client.callTool({
          name: toolName,
          arguments: request.params.arguments ?? {},
        });
      } finally {
        await client.close();
        await transport.close();
      }

      const durationMs = Date.now() - startMs;

      await prisma.auditLog.create({
        data: {
          userId,
          upstreamId: upstream.id,
          toolName,
          status: "SUCCESS",
          durationMs,
          details: { gatewayToolName },
        },
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      console.error(`MCP tool call failed: ${gatewayToolName}`, (error as Error).message);

      await prisma.auditLog.create({
        data: {
          userId,
          upstreamId: upstream.id,
          toolName,
          status: "ERROR",
          durationMs,
          details: {
            gatewayToolName,
            error: (error as Error).message,
          },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `Upstream tool call failed: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// The external MCP client must provide its API key in the Authorization header.
router.all(
  "/",
  authenticateApiKey,
  async (req: AuthenticatedRequest, res) => {
    let server: Server | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    try {
      server = await createGatewayServer(req.user!.id);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        void transport?.close();
        void server?.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Unified MCP endpoint failed:", error);

      if (!res.headersSent) {
        res.status(500).json({
          error: "MCP request failed",
        });
      }

      await transport?.close().catch(() => {});
      await server?.close().catch(() => {});
    }
  }
);

export default router;
