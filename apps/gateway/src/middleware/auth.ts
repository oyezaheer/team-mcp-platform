
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import prisma from "../lib/prisma.js";
import { hashApiKey } from "../lib/apiKeys.js";

export type AuthenticatedRequest = Request & {
    user?: {
        id: string;
        email: string;
        role: string;
    };
    apiKeyId?: string;
};

export async function authenticateApiKey(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const authorization = req.header("Authorization");
        const match = authorization?.match(/^Bearer (tmcp_[a-zA-Z0-9_]+)$/);

        if (!match) {
            res.status(401).json({ error: "Missing or invalid API key" });
            return;
        }

        const key = match[1];
        const keyHash = hashApiKey(key);

        const apiKey = await prisma.apiKey.findUnique({
            where: { keyHash },
            include: { user: true },
        });

        if (!apiKey || apiKey.revokedAt || !apiKey.user) {
            res.status(401).json({ error: "Invalid or revoked API key" });
            return;
        }

        // Constant-time comparison of the stored hash and computed hash.
        const stored = Buffer.from(apiKey.keyHash, "hex");
        const supplied = Buffer.from(keyHash, "hex");

        if (
            stored.length !== supplied.length ||
            !timingSafeEqual(stored, supplied)
        ) {
            res.status(401).json({ error: "Invalid API key" });
            return;
        }

        await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { lastUsedAt: new Date() },
        });


        req.user = {
            id: apiKey.user.id,
            email: apiKey.user.email,
            role: apiKey.user.role,
        };
        req.apiKeyId = apiKey.id;

        next();
    } catch (error) {
        console.error("API-key authentication failed:", error);
        res.status(500).json({ error: "Authentication failed" });
    }
}
