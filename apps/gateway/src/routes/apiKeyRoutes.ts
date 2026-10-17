
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { generateApiKey } from "../lib/apiKeys.js";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/users — list all users (admin only)
// ---------------------------------------------------------------------------
router.get("/users", authenticateApiKey, requireAdmin, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    res.json({ users });
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users — invite a new team member (admin only)
// ---------------------------------------------------------------------------
router.post(
  "/users",
  authenticateApiKey,
  requireAdmin,
  async (req, res) => {
    try {
      const { email, name } = req.body;

      if (!email || typeof email !== "string") {
        res.status(400).json({ error: "A valid email is required" });
        return;
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        res.status(409).json({ error: "User already exists" });
        return;
      }

      const user = await prisma.user.create({
        data: {
          email,
          name: typeof name === "string" ? name : null,
          role: "MEMBER",
        },
      });

      const generated = generateApiKey();

      await prisma.apiKey.create({
        data: {
          name: "Initial API key",
          keyHash: generated.keyHash,
          keyPrefix: generated.keyPrefix,
          userId: user.id,
        },
      });

      res.status(201).json({
        message: "User and API key created",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        apiKey: generated.key,
      });
    } catch (error) {
      console.error("User creation failed:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/me — return the authenticated user's own info
// ---------------------------------------------------------------------------
router.get("/me", authenticateApiKey, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    res.json({ user });
  } catch (error) {
    console.error("Me fetch failed:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/me/generate-key — member generates their own new key
// ---------------------------------------------------------------------------
router.post(
  "/users/me/generate-key",
  authenticateApiKey,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const generated = generateApiKey();

      await prisma.$transaction([
        prisma.apiKey.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.apiKey.create({
          data: {
            name: "Self-generated key",
            keyHash: generated.keyHash,
            keyPrefix: generated.keyPrefix,
            userId,
          },
        }),
      ]);

      res.json({ message: "New API key generated", apiKey: generated.key });
    } catch (error) {
      console.error("Key generation failed:", error);
      res.status(500).json({ error: "Failed to generate key" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:userId/rotate-key — rotate a user's API key (admin)
// ---------------------------------------------------------------------------
router.post(
  "/users/:userId/rotate-key",
  authenticateApiKey,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const generated = generateApiKey();

      await prisma.$transaction([
        prisma.apiKey.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.apiKey.create({
          data: {
            name: "Rotated API key",
            keyHash: generated.keyHash,
            keyPrefix: generated.keyPrefix,
            userId,
          },
        }),
      ]);

      res.json({ message: "API key rotated successfully", apiKey: generated.key });
    } catch (error) {
      console.error("API key rotation failed:", error);
      res.status(500).json({ error: "Failed to rotate API key" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:userId/revoke-keys — revoke all active keys (admin)
// ---------------------------------------------------------------------------
router.post(
  "/users/:userId/revoke-keys",
  authenticateApiKey,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const result = await prisma.apiKey.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      res.json({
        message: "Active API keys revoked successfully",
        revokedCount: result.count,
      });
    } catch (error) {
      console.error("API key revocation failed:", error);
      res.status(500).json({ error: "Failed to revoke API keys" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/audit — read audit log (admin only, paginated)
// ---------------------------------------------------------------------------
router.get(
  "/audit",
  authenticateApiKey,
  requireAdmin,
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            user: { select: { id: true, email: true, name: true } },
            upstream: { select: { id: true, name: true } },
          },
        }),
        prisma.auditLog.count(),
      ]);

      res.json({ logs, total, page, limit });
    } catch (error) {
      console.error("Audit log fetch failed:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  }
);

export default router;
