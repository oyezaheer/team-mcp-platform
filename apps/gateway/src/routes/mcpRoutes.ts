
import { Router } from "express";
import prisma from "../lib/prisma.js";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { connectMcpClient } from "../lib/mcpClient.js";
import { canAccessTool } from "../lib/toolPermissions.js";
import { decryptCredential } from "../lib/credentialCrypto.js";

const router = Router();

router.use(authenticateApiKey);

// ---------------------------------------------------------------------------
// GET /api/mcp/tools — discover tools from all enabled upstreams
// ---------------------------------------------------------------------------
router.get("/tools", async (req: AuthenticatedRequest, res) => {
  try {
    const upstreams = await prisma.upstream.findMany({
      where: { enabled: true },
    });

    const results = await Promise.all(
      upstreams.map(
        async (upstream: {
          id: string;
          name: string;
          url: string;
          credential: string | null;
        }) => {
          try {
            const { client, transport } = await connectMcpClient(
              upstream.url,
              decryptCredential(upstream.credential),
              10_000
            );

            try {
              const response = await client.listTools();

              return response.tools
                .filter((tool: any) =>
                  canAccessTool(req.user?.role, tool.name)
                )
                .map((tool: any) => ({
                  ...tool,
                  name: `${upstream.id}__${tool.name}`,
                  upstreamId: upstream.id,
                  upstreamName: upstream.name,
                }));
            } finally {
              await client.close();
              await transport.close();
            }
          } catch (error) {
            console.error(
              `Failed to discover tools from ${upstream.name}:`,
              (error as Error).message
            );
            return [];
          }
        }
      )
    );

    res.json({ tools: results.flat() });
  } catch (error) {
    console.error("Tool discovery failed:", error);
    res.status(500).json({ error: "Tool discovery failed" });
  }
});


router.post("/tools/call", async (req: AuthenticatedRequest, res) => {
  const { name, arguments: toolArguments = {} } = req.body ?? {};

  if (
    toolArguments === null ||
    typeof toolArguments !== "object" ||
    Array.isArray(toolArguments)
  ) {
    res.status(400).json({
      error: "'arguments' must be a JSON object",
    });
    return;
  }

  if (typeof name !== "string" || !name.includes("__")) {
    res.status(400).json({
      error: "Provide a tool name returned by GET /api/mcp/tools",
    });
    return;
  }

  const separator = name.indexOf("__");
  const upstreamId = name.slice(0, separator);
  const toolName = name.slice(separator + 2);


  if (!canAccessTool(req.user?.role, toolName)) {
    try {
      const knownUpstream = await prisma.upstream.findUnique({
        where: { id: upstreamId },
        select: { id: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          upstreamId: knownUpstream?.id ?? null,
          toolName,
          status: "DENIED",
          durationMs: 0,
          details: {
            gatewayToolName: name,
            reason: "role_forbidden",
            role: req.user?.role,
          },
        },
      });
    } catch (auditError) {
      console.error("Failed to audit tool error:", auditError);
    }

    res.status(403).json({
      error: "Forbidden: your role cannot execute this tool",
    });
    return;
  }

  if (!toolName) {
    res.status(400).json({ error: "Invalid tool name" });
    return;
  }

  const upstream = await prisma.upstream.findFirst({
    where: { id: upstreamId, enabled: true },
  });

  if (!upstream) {
    res.status(404).json({ error: "Enabled upstream not found" });
    return;
  }

  const startMs = Date.now();

  try {
    const { client, transport } = await connectMcpClient(
      upstream.url,
      decryptCredential(upstream.credential),
      15_000
    );

    let result;

    try {
      result = await client.callTool({
        name: toolName,
        arguments: toolArguments,
      });
    } finally {
      await client.close();
      await transport.close();
    }

    const durationMs = Date.now() - startMs;

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        upstreamId: upstream.id,
        toolName,
        status: "SUCCESS",
        durationMs,
        details: { gatewayToolName: name },
      },
    });

    res.json({ result });
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error(`Tool call failed for ${name}:`, (error as Error).message);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        upstreamId: upstream.id,
        toolName,
        status: "ERROR",
        durationMs,
        details: {
          gatewayToolName: name,
          error: (error as Error).message,
        },
      },
    });

    res.status(502).json({
      error: `Upstream tool call failed: ${(error as Error).message}`,
    });
  }
});
export default router;
