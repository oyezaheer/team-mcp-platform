
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

const inventory = [
  { id: "item-1", name: "Laptop", quantity: 12 },
  { id: "item-2", name: "Keyboard", quantity: 30 },
  { id: "item-3", name: "Mouse", quantity: 45 },
];

function createMcpServer() {
  const server = new McpServer({
    name: "inventory-mcp",
    version: "1.0.0",
  });

  server.tool(
    "list_inventory",
    "List all inventory items and their quantities",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(inventory, null, 2),
        },
      ],
    })
  );

  server.tool(
    "get_inventory_item",
    "Get an inventory item by its ID",
    { id: z.string() },
    async ({ id }) => {
      const item = inventory.find((entry) => entry.id === id);

      return {
        content: [
          {
            type: "text",
            text: item
              ? JSON.stringify(item, null, 2)
              : `Inventory item '${id}' not found`,
          },
        ],
        isError: !item,
      };
    }
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
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
    console.error("Inventory MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Inventory MCP request failed" });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "inventory-mcp" });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, "0.0.0.0", () => {
  console.log(`Inventory MCP server listening on port ${port}`);
});
