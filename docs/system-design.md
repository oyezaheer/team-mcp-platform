# System Design and Tradeoffs

## Components

| Component | Responsibility |
|---|---|
| Gateway (`apps/gateway`) | MCP client to every upstream, MCP server to every user. API-key auth, role checks, tool aggregation, routing, audit log, chat agent. |
| Dashboard (`apps/dashboard`) | React UI behind nginx. Servers, team and keys, audit log, chat, "My API Key". |
| WooCommerce MCP (`services/woocommerce-mcp`) | Our own MCP server (Streamable HTTP) exposing products and orders as tools. |
| Inventory MCP, Support MCP | Two further upstreams, showing the gateway is not WooCommerce-specific. |
| WordPress + WooCommerce, MariaDB | The store, with persistent volumes. |
| PostgreSQL | Gateway state: users, hashed API keys, upstreams, audit log. |
| Ingress | The only public entry: store, gateway and dashboard hosts. |

## Request flow

1. A client (MCP Inspector, Claude Code, or the dashboard chat) sends a request with `Authorization: Bearer tmcp_...`.
2. The gateway hashes the key (SHA-256) and looks it up. Unknown or revoked keys get 401.
3. `tools/list`: the gateway lists tools from every enabled upstream in parallel, filters by role, and returns them with namespaced names.
4. `tools/call`: the gateway splits the name, checks the role again, loads the upstream, decrypts its credential, connects, calls the tool, and closes the connection.
5. The result is returned and an audit row is written (user, server, tool, time, duration, outcome).

For example, a member asking "what orders came in today?" in the chat sends a `list_orders` call. The gateway forwards it to the WooCommerce MCP, which calls the WooCommerce REST API in the same cluster and returns a trimmed result.

## Tool name collisions

Every tool is exposed as `<upstreamId>__<toolName>`. The upstream id is a unique generated id, so two servers can both expose `list_orders` with no clash. The gateway splits on the first `__`, so tool names containing `__` still work. The chat agent and external clients see the same names. The tool description is prefixed with the server name (for example `[WooCommerce MCP]`) so humans and models can tell servers apart.

## Failure handling

- Tool discovery runs per upstream in parallel with its own timeout (10 s REST, 8 s chat). A failure is caught and that upstream contributes zero tools. Other servers are unaffected.
- Tool calls have a 15 s timeout, use an `AbortController`, reject redirects, and return a clear error (HTTP 502 on REST, an MCP error on `/mcp`). The failure is audited as `ERROR`.
- The dashboard marks a server `Unreachable` when it can't list tools. We verified this by deleting the Support pod: the other two servers kept working.
- The LLM call has a 90 s timeout. The agent loop is capped at 6 rounds and refuses to repeat an identical tool call.

## How the WooCommerce MCP talks to the store, and why

It uses the **WooCommerce REST API** with a consumer key and secret held in a Kubernetes Secret.

- It is the supported, versioned interface for products and orders, with validation and hooks.
- It needs only the in-cluster URL (`http://wordpress`) and credentials. WP-CLI would need shell access into the WordPress pod or a shared volume, which couples the services and needs more privileges.
- Direct database access would bypass WooCommerce business logic.
- The MCP returns only the fields the tools need (order id, status, date, total, line items). Customer names, emails and addresses are never returned.

## Authentication and access

- Roles: `ADMIN` (manage servers, members, keys, audit, all tools) and `MEMBER` (read-only tools).
- API keys are 256-bit random values, stored as SHA-256 hashes, and shown once. A fast hash is appropriate for high-entropy random keys.
- Restricted tools are hidden from `tools/list` and rejected on both `/api/mcp/tools/call` and `/mcp`.
- Upstream credentials are encrypted with AES-256-GCM. The key comes from a Secret. Credentials never reach browsers or MCP clients.

## Chat agent

`POST /api/chat` authenticates the caller, builds the tool list from enabled upstreams filtered by role, and runs an OpenAI-compatible tool loop against a local Ollama model (`qwen2.5:3b`). Tool calls are executed with the caller's user id, so audit rows carry the right person and are marked `source: chat_agent`. The UI shows each tool call and its arguments, but not raw results.

## Kubernetes layout

- One Helm chart. Local and production differ only by values files.
- Probes and requests/limits on every workload. Persistent volumes for MariaDB, WordPress and PostgreSQL.
- Only the dashboard, gateway and store have Ingress rules. The MCP servers and databases are ClusterIP.
- Default-deny NetworkPolicies with explicit allow rules (gateway to MCP servers and Postgres, WordPress to MariaDB, Woo MCP to WordPress, ingress controller to public services). Enforcement needs a policy-capable CNI. Docker Desktop doesn't enforce them. k3s does.
- Schema changes ship as Prisma migrations, applied on gateway start.
- `WP_HOME` and `WP_SITEURL` come from Helm values, so a hostname change is a values change plus `helm upgrade`.

## Local to production

| Concern | Local | Production (k3s) |
|---|---|---|
| Domains | `*.localtest.me` | real domains |
| Ingress class | nginx | traefik |
| TLS | none | cert-manager |
| Storage | default | `local-path` |
| Images | local | registry-qualified |
| Secrets | file outside the repo | file or secret manager at install time |
| LLM | Ollama on the laptop | hosted OpenAI-compatible endpoint |

Upgrades use `helm upgrade`, and `helm rollback <revision>` reverts a release.

## Tradeoffs

- **Connection per call.** The gateway connects to an upstream, calls, and closes. It is simple and stateless, with no sessions to leak, at the cost of extra latency per call. A pooled client is the next step.
- **Tool permissions by bare name.** A built-in read-only allowlist is easy to reason about, but it matches the tool name regardless of server. A per-upstream permission table in the database would be more precise.
- **Single gateway replica.** Sessions are not shared. Scaling out would need a shared session store.
- **Small local model.** It satisfies the "tool loop works" goal, but it is slow (about 50 to 90 s per answer) and its reasoning is weak.
- **Manual store setup.** WordPress and WooCommerce setup is done by hand. A WP-CLI init Job would make it repeatable.
- **First admin.** It is created by `deploy/bootstrap.ps1`, not by an in-app flow.