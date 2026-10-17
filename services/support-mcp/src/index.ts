import express from "express";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "../data/tickets.json");
const PORT = Number(process.env.PORT) || 3004;

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high";

interface Ticket {
  id: string;
  customerEmail: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  orderId: number | null;
  createdAt: string;
}

async function readTickets(): Promise<Ticket[]> {
  return JSON.parse(await readFile(DATA_FILE, "utf8")) as Ticket[];
}

async function saveTickets(tickets: Ticket[]): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(tickets, null, 2), "utf8");
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "team-support-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "list_tickets",
    {
      title: "List support tickets",
      description: "List support tickets, optionally filtered by status or priority.",
      inputSchema: {
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ status, priority, limit }) => {
      let tickets = await readTickets();
      if (status) tickets = tickets.filter((ticket) => ticket.status === status);
      if (priority) tickets = tickets.filter((ticket) => ticket.priority === priority);
      tickets = tickets.slice(0, limit);

      return {
        content: [{ type: "text", text: JSON.stringify(tickets, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_ticket",
    {
      title: "Get support ticket",
      description: "Retrieve one support ticket by its ID.",
      inputSchema: {
        ticketId: z.string().min(1),
      },
    },
    async ({ ticketId }) => {
      const ticket = (await readTickets()).find((item) => item.id === ticketId);
      if (!ticket) {
        return {
          isError: true,
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_ticket_status",
    {
      title: "Update support ticket status",
      description: "Change a ticket status to open, in_progress, resolved, or closed.",
      inputSchema: {
        ticketId: z.string().min(1),
        status: z.enum(["open", "in_progress", "resolved", "closed"]),
      },
    },
    async ({ ticketId, status }) => {
      const tickets = await readTickets();
      const index = tickets.findIndex((item) => item.id === ticketId);

      if (index === -1) {
        return {
          isError: true,
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
        };
      }

      tickets[index].status = status;
      await saveTickets(tickets);

      return {
        content: [{ type: "text", text: JSON.stringify(tickets[index], null, 2) }],
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "support-mcp" });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Support MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Support MCP request failed" });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").send("Use POST for MCP requests.");
});

app.delete("/mcp", (_req, res) => {
  res.status(405).send("Stateless MCP transport does not support session deletion.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Support MCP server listening on port ${PORT}`);
});
