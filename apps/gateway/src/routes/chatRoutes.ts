
/**
 * Chat agent route — POST /api/chat
 *
 * Accepts a conversation history from the dashboard, calls an LLM with the
 * gateway tools available as function-calling tools, runs the tool loop, and
 * streams (or returns) the final answer.
 *
 * The agent acts as the authenticated user, so every tool call lands in the
 * audit log under that user.
 *
 * Environment variables:
 *   LLM_PROVIDER   = "openai" | "gemini"  (default: "openai")
 *   LLM_BASE_URL   = base URL for the OpenAI-compatible API
 *   LLM_API_KEY    = API key
 *   LLM_MODEL      = model name (default: gpt-4o-mini / gemini-1.5-flash)
 */

import { Router } from "express";
import prisma from "../lib/prisma.js";
import { connectMcpClient } from "../lib/mcpClient.js";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

const router = Router();
router.use(authenticateApiKey);

// ---------------------------------------------------------------------------
// Build the list of gateway-namespaced tools for the LLM function schema
// ---------------------------------------------------------------------------
async function getGatewayToolsForLLM() {
  const upstreams = await prisma.upstream.findMany({ where: { enabled: true } });

  const allTools: any[] = [];

  await Promise.all(
    upstreams.map(async (upstream) => {
      try {
        const { client, transport } = await connectMcpClient(
          upstream.url,
          upstream.credential,
          8_000
        );
        try {
          const res = await client.listTools();
          for (const t of res.tools) {
            allTools.push({
              type: "function",
              function: {
                name: `${upstream.id}__${t.name}`,
                description: `[${upstream.name}] ${t.description ?? t.name}`,
                parameters: t.inputSchema ?? { type: "object", properties: {} },
              },
              _upstreamId: upstream.id,
              _upstreamName: upstream.name,
              _toolName: t.name,
            });
          }
        } finally {
          await client.close();
          await transport.close();
        }
      } catch (err) {
        console.warn(`Chat: could not load tools from ${upstream.name}:`, (err as Error).message);
      }
    })
  );

  return allTools;
}

// ---------------------------------------------------------------------------
// Call the actual upstream tool and write the audit log
// ---------------------------------------------------------------------------
async function callUpstreamTool(
  gatewayToolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  const sep = gatewayToolName.indexOf("__");
  if (sep < 0) return "Invalid tool name";

  const upstreamId = gatewayToolName.slice(0, sep);
  const toolName = gatewayToolName.slice(sep + 2);

  const upstream = await prisma.upstream.findFirst({
    where: { id: upstreamId, enabled: true },
  });

  if (!upstream) return `Upstream '${upstreamId}' not found or disabled`;

  const startMs = Date.now();

  try {
    const { client, transport } = await connectMcpClient(
      upstream.url,
      upstream.credential,
      15_000
    );

    let result: any;
    try {
      result = await client.callTool({ name: toolName, arguments: args });
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
        details: { source: "chat_agent", gatewayToolName },
      },
    });

    // Extract text from MCP content array
    const content = result?.content ?? [];
    const text = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return text || JSON.stringify(result);
  } catch (err) {
    const durationMs = Date.now() - startMs;

    await prisma.auditLog.create({
      data: {
        userId,
        upstreamId: upstream.id,
        toolName,
        status: "ERROR",
        durationMs,
        details: {
          source: "chat_agent",
          gatewayToolName,
          error: (err as Error).message,
        },
      },
    });

    return `Tool error: ${(err as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat — run one turn of the agentic loop
// ---------------------------------------------------------------------------
router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const llmBaseUrl =
      process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
    const llmApiKey = process.env.LLM_API_KEY;
    const llmModel =
      process.env.LLM_MODEL ?? "gpt-4o-mini";

    if (!llmApiKey) {
      res.status(503).json({ error: "LLM_API_KEY is not configured" });
      return;
    }

    // Gather all gateway tools
    const gatewayTools = await getGatewayToolsForLLM();

    // LLM function-call tools (strip internal _* fields)
    const llmTools = gatewayTools.map(({ _upstreamId, _upstreamName, _toolName, ...t }) => t);

    const conversationMessages = [...messages];
    const toolCallsLog: Array<{
      tool: string;
      arguments: Record<string, unknown>;
      result: string;
    }> = [];

    // Agentic loop — max 8 rounds to prevent runaway spending
    for (let round = 0; round < 8; round++) {
      const llmRes = await fetch(`${llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmApiKey}`,
        },
        body: JSON.stringify({
          model: llmModel,
          messages: conversationMessages,
          tools: llmTools.length > 0 ? llmTools : undefined,
          tool_choice: llmTools.length > 0 ? "auto" : undefined,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!llmRes.ok) {
        const err = await llmRes.text();
        console.error("LLM error:", err);
        res.status(502).json({ error: `LLM request failed: ${llmRes.status}` });
        return;
      }

      const llmData = (await llmRes.json()) as any;
      const choice = llmData.choices?.[0];

      if (!choice) {
        res.status(502).json({ error: "LLM returned no choices" });
        return;
      }

      const msg = choice.message;
      conversationMessages.push(msg);

      // If no tool calls — we have the final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        res.json({
          reply: msg.content ?? "",
          toolCallsLog,
          messages: conversationMessages,
        });
        return;
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc: any) => {
          const toolName = tc.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments ?? "{}");
          } catch {
            /* ignore parse errors */
          }

          const result = await callUpstreamTool(toolName, args, req.user!.id);

          toolCallsLog.push({ tool: toolName, arguments: args, result });

          return {
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          };
        })
      );

      conversationMessages.push(...toolResults);
    }

    res.json({
      reply: "Maximum tool-call rounds reached. Please try a simpler question.",
      toolCallsLog,
      messages: conversationMessages,
    });
  } catch (error) {
    console.error("Chat agent error:", error);
    res.status(500).json({ error: "Chat agent failed" });
  }
});

export default router;
