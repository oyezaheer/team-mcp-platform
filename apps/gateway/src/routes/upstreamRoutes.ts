
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { connectMcpClient } from "../lib/mcpClient.js";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// All upstream management routes require an authenticated admin.
router.use(authenticateApiKey, requireAdmin);

// ---------------------------------------------------------------------------
// GET /api/admin/upstreams — list all registered upstream MCP servers with status
// ---------------------------------------------------------------------------
router.get("/", async (_req: AuthenticatedRequest, res) => {
  try {
    const upstreams = await prisma.upstream.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        enabled: true,
        // Never expose credential to the client
        createdAt: true,
        updatedAt: true,
      },
    });

    // Probe each enabled upstream for status (fire-and-forget health checks)
    const withStatus = await Promise.all(
      upstreams.map(async (upstream) => {
        if (!upstream.enabled) {
          return { ...upstream, status: "Disabled" as const };
        }

        try {
          const { client, transport } = await connectMcpClient(
            upstream.url,
            undefined,
            5_000
          );
          const toolsRes = await client.listTools();
          await client.close();
          await transport.close();
          return {
            ...upstream,
            status: "Connected" as const,
            toolCount: toolsRes.tools.length,
          };
        } catch {
          return { ...upstream, status: "Unreachable" as const, toolCount: 0 };
        }
      })
    );

    res.json({ upstreams: withStatus });
  } catch (error) {
    console.error("Failed to list upstreams:", error);
    res.status(500).json({ error: "Failed to list upstreams" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/upstreams — register a new upstream MCP server
// ---------------------------------------------------------------------------
router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { name, url, description, credential } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof url !== "string" ||
      !url.trim()
    ) {
      res.status(400).json({ error: "Name and URL are required" });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid upstream URL" });
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      res
        .status(400)
        .json({ error: "Upstream URL must use HTTP or HTTPS" });
      return;
    }

    const upstream = await prisma.upstream.create({
      data: {
        name: name.trim(),
        url: parsedUrl.toString(),
        description:
          typeof description === "string" ? description.trim() : null,
        credential:
          typeof credential === "string" && credential.trim()
            ? credential.trim()
            : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        upstreamId: upstream.id,
        toolName: "upstream.create",
        status: "SUCCESS",
        details: { name: upstream.name, url: upstream.url },
      },
    });

    // Return without credential
    const { credential: _cred, ...safe } = upstream as any;
    res.status(201).json({ message: "Upstream registered successfully", upstream: safe });
  } catch (error) {
    console.error("Failed to register upstream:", error);
    res.status(500).json({ error: "Failed to register upstream" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/upstreams/:id — edit name, url, description, credential, enabled
// ---------------------------------------------------------------------------
router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, credential, enabled } = req.body ?? {};

    const existing = await prisma.upstream.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Upstream not found" });
      return;
    }

    // Validate URL if provided
    let parsedUrl: URL | undefined;
    if (url !== undefined) {
      try {
        parsedUrl = new URL(url);
      } catch {
        res.status(400).json({ error: "Invalid upstream URL" });
        return;
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        res
          .status(400)
          .json({ error: "Upstream URL must use HTTP or HTTPS" });
        return;
      }
    }

    const updated = await prisma.upstream.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim()
          ? { name: name.trim() }
          : {}),
        ...(parsedUrl ? { url: parsedUrl.toString() } : {}),
        ...(description !== undefined
          ? {
              description:
                typeof description === "string" ? description.trim() : null,
            }
          : {}),
        ...(credential !== undefined
          ? {
              credential:
                typeof credential === "string" && credential.trim()
                  ? credential.trim()
                  : null,
            }
          : {}),
        ...(typeof enabled === "boolean" ? { enabled } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        upstreamId: updated.id,
        toolName: "upstream.update",
        status: "SUCCESS",
        details: { name: updated.name, enabled: updated.enabled },
      },
    });

    const { credential: _cred, ...safe } = updated as any;
    res.json({ message: "Upstream updated", upstream: safe });
  } catch (error) {
    console.error("Failed to update upstream:", error);
    res.status(500).json({ error: "Failed to update upstream" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/upstreams/:id/toggle — quick enable/disable toggle
// ---------------------------------------------------------------------------
router.patch("/:id/toggle", async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled } = req.body ?? {};
    const { id } = req.params;

    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "Provide enabled as true or false" });
      return;
    }

    const existing = await prisma.upstream.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Upstream not found" });
      return;
    }

    const upstream = await prisma.upstream.update({
      where: { id },
      data: { enabled },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        upstreamId: upstream.id,
        toolName: enabled ? "upstream.enable" : "upstream.disable",
        status: "SUCCESS",
        details: { name: upstream.name, enabled },
      },
    });

    const { credential: _cred, ...safe } = upstream as any;
    res.json({ message: "Upstream updated successfully", upstream: safe });
  } catch (error) {
    console.error("Failed to update upstream:", error);
    res.status(500).json({ error: "Failed to update upstream" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/upstreams/:id — remove an upstream
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.upstream.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Upstream not found" });
      return;
    }

    await prisma.upstream.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        toolName: "upstream.delete",
        status: "SUCCESS",
        details: { name: existing.name, url: existing.url },
      },
    });

    res.json({ message: "Upstream removed" });
  } catch (error) {
    console.error("Failed to delete upstream:", error);
    res.status(500).json({ error: "Failed to delete upstream" });
  }
});

export default router;
