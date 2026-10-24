
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
import { canAccessTool } from "../lib/toolPermissions.js";
import { decryptCredential } from "../lib/credentialCrypto.js";

const router = Router();
router.use(authenticateApiKey);

// ---------------------------------------------------------------------------
// Build the list of gateway-namespaced tools for the LLM function schema
// ---------------------------------------------------------------------------
async function getGatewayToolsForLLM(role: string | undefined) {
  const upstreams = await prisma.upstream.findMany({ where: { enabled: true } });

  const allTools: any[] = [];

  await Promise.all(
    upstreams.map(async (upstream) => {
      try {
        const { client, transport } = await connectMcpClient(
          upstream.url,
          decryptCredential(upstream.credential),
          8_000
        );
        try {
          const res = await client.listTools();
          for (const t of res.tools) {
            if (!canAccessTool(role, t.name)) continue;
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
  userId: string,
  role: string | undefined
): Promise<string> {
  const sep = gatewayToolName.indexOf("__");
  if (sep < 0) return "Invalid tool name";

  const upstreamId = gatewayToolName.slice(0, sep);
  const toolName = gatewayToolName.slice(sep + 2);

  if (!canAccessTool(role, toolName)) {
    await prisma.auditLog.create({
      data: {
        userId,
        upstreamId,
        toolName,
        status: "DENIED",
        durationMs: 0,
        details: {
          source: "chat_agent",
          reason: "Tool access denied by role permissions",
        },
      },
    });

    return "Permission denied: your role cannot access this tool.";
  }

  const upstream = await prisma.upstream.findFirst({
    where: { id: upstreamId, enabled: true },
  });

  if (!upstream) return `Upstream '${upstreamId}' not found or disabled`;

  const startMs = Date.now();

  try {
    const { client, transport } = await connectMcpClient(
      upstream.url,
      decryptCredential(upstream.credential),
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
    const gatewayTools = await getGatewayToolsForLLM(req.user?.role);

    // LLM function-call tools (strip internal _* fields)
    const llmTools = gatewayTools.map(({ _upstreamId, _upstreamName, _toolName, ...t }) => t);

    const conversationMessages = [
      {
        role: "system",
        content:
          `You are an MCP tool-using assistant.
Current date: ${new Date().toISOString().slice(0, 10)}.
Use available tools for factual data. Never invent dates, tool results, or order details.
For questions about today's orders, use the current date above to construct the date filter.
Do not repeat an identical tool call after receiving its result.
Summarize successful tool results accurately.
Never reveal customer names, addresses, email addresses, phone numbers, order keys, or payment URLs.`,
      },
      ...messages,
    ];
    const toolCallsLog: Array<{
      tool: string;
      arguments: Record<string, unknown>;
      result: string;
    }> = [];

    // Agentic loop — max 8 rounds to prevent runaway spending

    const executedToolCalls = new Set<string>();

    for (let round = 0; round < 6; round++) {
      const llmStart = Date.now();
      console.log(`[chat] LLM round ${round + 1}/6 started`);

      let llmRes: Response;

      try {
        llmRes = await fetch(`${llmBaseUrl}/chat/completions`, {
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
            temperature: 0,
            max_tokens: 1024,
          }),

          signal: AbortSignal.timeout(90_000),
        });

        console.log(
          `[chat] LLM round ${round + 1}/6 responded in ${Date.now() - llmStart
          }ms`
        );
      } catch (err) {
        console.error(
          `[chat] LLM round ${round + 1}/6 failed after ${Date.now() - llmStart
          }ms:`,
          err
        );

        if (toolCallsLog.length > 0) {
          res.json({
            reply:
              "The tool call completed, but the local AI model timed out while preparing the final response. Please retry with a simpler question.",
            toolCallsLog: toolCallsLog.map((item: any) => ({
              tool: item.tool,
              arguments: item.arguments,
              result: "[Result withheld from timeout response]",
            })),
          });
          return;
        }

        res.status(504).json({
          error:
            "The local AI model timed out. Please retry with a simpler prompt.",
        });
        return;
      }

      if (!llmRes.ok) {
        const err = await llmRes.text();
        console.error("LLM error:", err);
        res.status(502).json({
          error: `LLM request failed: ${llmRes.status}`,
        });
        return;
      }

      const llmData = (await llmRes.json()) as any;
      const choice = llmData.choices?.[0];

      if (!choice) {
        res.status(502).json({ error: "LLM returned no choices" });
        return;
      }

      const msg = choice.message;

      console.log("[chat] LLM response diagnostics:", {
        finishReason: choice.finish_reason,
        contentType: typeof msg?.content,
        contentLength:
          typeof msg?.content === "string" ? msg.content.length : null,
        toolCalls:
          msg?.tool_calls?.map((tc: any) => tc.function?.name) ?? [],
        usage: llmData.usage,
      });

      const toolCalls = msg?.tool_calls ?? [];

      // No tool calls: accept a non-empty final response.
      if (toolCalls.length === 0) {
        const reply =
          typeof msg?.content === "string" ? msg.content.trim() : "";

        if (reply) {
          conversationMessages.push(msg);

          res.json({
            reply,
            toolCallsLog: toolCallsLog.map((item: any) => ({
              ...item,
              result: "[Tool result recorded]",
            })),
            messages: conversationMessages,
          });
          return;
        }

        console.warn(
          `[chat] Empty LLM response on round ${round + 1}`
        );

        // Do not run the same fallback or expose raw tool results here.
        res.status(502).json({
          error:
            "The local AI model returned an empty response. Please retry with a simpler prompt.",
        });
        return;
      }

      // Add the assistant tool-call message before its corresponding results.
      conversationMessages.push(msg);

      const toolResults = [];

      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        let args: Record<string, unknown>;

        try {
          args = JSON.parse(tc.function.arguments ?? "{}");
        } catch {
          args = {};
        }

        const callKey = `${toolName}:${JSON.stringify(args)}`;

        // Prevent the same tool + arguments from executing twice in one request.
        if (executedToolCalls.has(callKey)) {
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content:
              "This exact tool call was already executed. Use the existing result; do not repeat it.",
          });
          continue;
        }

        executedToolCalls.add(callKey);

        try {
          const result = await callUpstreamTool(
            toolName,
            args,
            req.user!.id,
            req.user?.role
          );

          toolCallsLog.push({
            tool: toolName,
            arguments: args,
            result: "[Result recorded]",
          });

          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        } catch (err) {
          console.error(`[chat] Tool call failed: ${toolName}`, err);

          toolCallsLog.push({
            tool: toolName,
            arguments: args,
            result: "[Tool call failed]",
          });

          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: "The tool call failed. Do not invent a result.",
          });
        }
      }

      conversationMessages.push(...toolResults);
    }

    res.status(502).json({
      error:
        "The assistant reached the maximum number of tool-use rounds. Please ask a more specific question.",
      toolCallsLog,
      messages: conversationMessages,
    });
    return;
  } catch (error) {
    console.error("Chat agent error:", error);
    res.status(500).json({ error: "Chat agent failed" });
  }
});
export default router;
