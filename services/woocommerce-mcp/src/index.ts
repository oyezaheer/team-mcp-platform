import "dotenv/config";
import express from "express";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const require = createRequire(import.meta.url);
const OAuth = require("oauth-1.0a");

const app = express();
app.use(express.json());

const port = Number(process.env.PORT) || 3003;
const storeUrl = process.env.WOOCOMMERCE_URL;
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

if (!storeUrl || !consumerKey || !consumerSecret) {
  throw new Error("Missing WooCommerce configuration in .env");
}

const oauth = new OAuth({
  consumer: { key: consumerKey, secret: consumerSecret },
  signature_method: "HMAC-SHA1",
  hash_function(baseString: string, signingKey: string) {
    return crypto
      .createHmac("sha1", signingKey)
      .update(baseString)
      .digest("base64");
  },
});

let cachedCanonicalUrl: string | null = process.env.WOOCOMMERCE_SIGN_URL || null;

async function getCanonicalUrl(): Promise<string> {
  if (cachedCanonicalUrl) return cachedCanonicalUrl;
  try {
    const res = await fetch(`${storeUrl!.replace(/\/+$/, "")}/wp-json`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.url) {
        cachedCanonicalUrl = String(data.url).replace(/\/+$/, "");
        console.log(`Auto-detected WooCommerce canonical URL: ${cachedCanonicalUrl}`);
        return cachedCanonicalUrl;
      }
    }
  } catch (err) {
    console.warn("Could not auto-detect WordPress canonical URL:", (err as Error).message);
  }
  cachedCanonicalUrl = storeUrl!.replace(/\/+$/, "");
  return cachedCanonicalUrl;
}

async function wooRequest(
  method: "GET" | "POST" | "PUT",
  endpoint: string,
  data?: Record<string, unknown>
) {
  const signBase = await getCanonicalUrl();
  const baseUrl = `${storeUrl!.replace(/\/+$/, "")}/wp-json/wc/v3/${endpoint}`;
  const signBaseUrl = `${signBase}/wp-json/wc/v3/${endpoint}`;
  const url = new URL(baseUrl);
  const signUrlObj = new URL(signBaseUrl);

  // GET parameters must be included in the OAuth signature.
  if (method === "GET" && data) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
        signUrlObj.searchParams.set(key, String(value));
      }
    }
  }

  const request = { url: signUrlObj.toString(), method };
  const authorization = oauth.toHeader(oauth.authorize(request));

  const response = await fetch(url, {
    method,
    headers: {
      ...authorization,
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    ...(method !== "GET" && data ? { body: JSON.stringify(data) } : {}),
  });

  const text = await response.text();
  let result: unknown;

  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = text;
  }

  if (!response.ok) {
    const detail =
      typeof result === "object" && result !== null
        ? JSON.stringify(result)
        : String(result);

    throw new Error(`WooCommerce HTTP ${response.status}: ${detail}`);
  }

  return result;
}



const tools = [
  {
    name: "list_products",
    description: "List WooCommerce products",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 1, description: "Page number" },
        perPage: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Products per page",
        },
      },
    },
  },
  {
    name: "create_product",
    description: "Create a WooCommerce product",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name" },
        regularPrice: {
          type: "string",
          pattern: "^\\d+(\\.\\d{1,2})?$",
          description: "Regular price, e.g. 499.00",
        },
        description: { type: "string", description: "Product description" },
        status: {
          type: "string",
          enum: ["draft", "publish"],
          description: "Product status",
        },
      },
      required: ["name", "regularPrice"],
    },
  },
  {
    name: "list_orders",
    description: "List WooCommerce orders. Use `after` to filter by creation date (ISO 8601, e.g. today's date).",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 1, description: "Page number" },
        perPage: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Orders per page",
        },
        after: {
          type: "string",
          description:
            "Only return orders after this ISO 8601 date-time, e.g. 2024-01-01T00:00:00",
        },
        status: {
          type: "string",
          enum: [
            "pending",
            "processing",
            "on-hold",
            "completed",
            "cancelled",
            "refunded",
            "failed"
          ],
          description: "Filter by a valid WooCommerce order status."
        }
      },
    },
  },
  {
    name: "get_order",
    description: "Get one WooCommerce order by ID",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "integer", minimum: 1, description: "Order ID" },
      },
      required: ["orderId"],
    },
  },
  {
    name: "update_order_status",
    description: "Update the status of a WooCommerce order",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "integer", minimum: 1, description: "Order ID" },
        status: {
          type: "string",
          enum: [
            "pending",
            "processing",
            "on-hold",
            "completed",
            "cancelled",
            "refunded",
            "failed",
          ],
        },
      },
      required: ["orderId", "status"],
    },
  },
];


function createMcpServer() {
  const server = new Server(
    { name: "woocommerce-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {

        case "list_products": {
          const page = z.number().int().min(1).default(1).parse(input.page ?? 1);
          const perPage = z.number().int().min(1).max(100).default(10).parse(input.perPage ?? 10);

          const products = await wooRequest("GET", "products", {
            page,
            per_page: perPage,
          }) as any[];

          result = products.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            regular_price: product.regular_price,
            sale_price: product.sale_price,
            status: product.status,
            stock_status: product.stock_status,
          }));

          break;
        }


        case "create_product": {
          const data = z.object({
            name: z.string().min(1),
            regularPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
            description: z.string().optional(),
            status: z.enum(["draft", "publish"]).default("draft"),
          }).parse(input);

          result = await wooRequest("POST", "products", {
            name: data.name,
            regular_price: data.regularPrice,
            description: data.description ?? "",
            status: data.status,
          });
          break;
        }


        case "list_orders": {
          const page = z.number().int().min(1).default(1).parse(input.page ?? 1);
          const perPage = z.number().int().min(1).max(100).default(10).parse(input.perPage ?? 10);
          const after = z.string().optional().parse(input.after);
          const status = z.enum([
            "pending",
            "processing",
            "on-hold",
            "completed",
            "cancelled",
            "refunded",
            "failed",
          ]).optional().parse(input.status);

          const orders = await wooRequest("GET", "orders", {
            page,
            per_page: perPage,
            ...(after ? { after } : {}),
            ...(status ? { status } : {}),
          }) as any[];

          // Return only safe fields; never expose customer details or order keys.
          result = orders.map((order: any) => ({
            id: order.id,
            status: order.status,
            date_created: order.date_created,
            total: order.total,
            currency: order.currency,
            line_items: (order.line_items ?? []).map((item: any) => ({
              name: item.name,
              quantity: item.quantity,
            })),
          }));

          break;
        }



        case "get_order": {
          const data = z.object({
            orderId: z.number().int().positive(),
          }).parse(input);

          const order = await wooRequest(
            "GET",
            `orders/${data.orderId}`
          ) as any;

          // Return only safe order fields.
          result = {
            id: order.id,
            status: order.status,
            date_created: order.date_created,
            total: order.total,
            currency: order.currency,
            line_items: (order.line_items ?? []).map((item: any) => ({
              name: item.name,
              quantity: item.quantity,
            })),
          };

          break;
        }


        case "update_order_status": {
          const data = z.object({
            orderId: z.number().int().positive(),
            status: z.enum([
              "pending",
              "processing",
              "on-hold",
              "completed",
              "cancelled",
              "refunded",
              "failed",
            ]),
          }).parse(input);

          result = await wooRequest("PUT", `orders/${data.orderId}`, {
            status: data.status,
          });
          break;
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        content: [{ type: "text", text: `WooCommerce error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}



app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "woocommerce-mcp" });
});


app.post("/mcp", async (req, res) => {
  const server = createMcpServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }

    void transport.close();
    void server.close();
  }
});


app.listen(port, "0.0.0.0", () => {
  console.log(`WooCommerce MCP listening on port ${port}`);
});
