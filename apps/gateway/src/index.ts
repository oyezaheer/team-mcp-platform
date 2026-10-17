
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiKeyRoutes from "./routes/apiKeyRoutes.js";
import { authenticateApiKey } from "./middleware/auth.js";
import upstreamRoutes from "./routes/upstreamRoutes.js";
import mcpRoutes from "./routes/mcpRoutes.js";
import mcpHttpRoutes from "./routes/mcpHttpRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: process.env.DASHBOARD_ORIGIN ?? "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "4mb" }));

// Admin REST API (users, keys, audit, upstreams)
app.use("/api/admin", apiKeyRoutes);
app.use("/api/admin/upstreams", upstreamRoutes);

// MCP REST proxy (tool discovery + call over plain JSON — used by the dashboard chat)
app.use("/api/mcp", mcpRoutes);

// Chat agent endpoint (LLM + tool loop)
app.use("/api/chat", chatRoutes);

// Standard MCP Streamable HTTP endpoint (used by Claude Code, Cursor, MCP Inspector)
app.use("/mcp", mcpHttpRoutes);

app.get("/api/me", authenticateApiKey, (req: any, res) => {
  res.json({ user: req.user, message: "API key authenticated successfully" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "team-mcp-gateway",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP Gateway API listening on port ${PORT}`);
});
