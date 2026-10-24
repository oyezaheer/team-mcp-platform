# Team MCP Gateway for WooCommerce

A Kubernetes-native platform that connects several MCP servers behind one authenticated endpoint. An admin registers servers once; every team member then uses all of them through one MCP URL (Claude Code, Cursor, MCP Inspector) or a chat agent in the dashboard. The first data source is a WooCommerce store running in the same cluster.

## Architecture

```
 MCP client (user B) ──┐                              ┌─ WooCommerce MCP ── WordPress/WooCommerce ── MariaDB
 Dashboard chat (A) ───┼─► Ingress ─► Gateway ────────┼─ Inventory MCP
 Dashboard UI ─────────┘             │  (auth, RBAC,  └─ Support MCP
                                     │   audit, routing)
                                     └─► PostgreSQL (users, hashed keys, upstreams, audit)
```

| Component | Role |
|---|---|
| `apps/gateway` | Express + MCP SDK. API-key auth, role-based tool access, aggregation, routing, audit, chat agent. |
| `apps/dashboard` | React + Vite UI: servers, team and keys, audit log, chat. |
| `services/woocommerce-mcp` | Our own MCP server (Streamable HTTP) over the WooCommerce REST API. |
| `services/inventory-mcp`, `services/support-mcp` | Two additional upstream MCP servers. |
| `deploy/helm/team-mcp-platform` | The Helm chart. Local and prod differ only by values files. |

Only the gateway talks to the MCP servers. They are ClusterIP services with no Ingress rule.

## Prerequisites

Docker Desktop with Kubernetes enabled (or k3d/kind), `kubectl`, `helm`, Node.js 22, and [Ollama](https://ollama.com) with `ollama pull qwen2.5:3b` for the chat agent.

## Local setup

**1. Ingress controller**

```powershell
helm upgrade --install ingress-nginx ingress-nginx --repo https://kubernetes.github.io/ingress-nginx -n ingress-nginx --create-namespace
```

**Local domains:** `*.localtest.me` always resolves to `127.0.0.1`, so there are no hosts-file edits. URLs: `store.localtest.me`, `gateway.localtest.me`, `dashboard.localtest.me`.

**2. Build images** (Docker Desktop's Kubernetes uses the local image store)

```powershell
docker build -t team-mcp-gateway:1.0.17   apps/gateway
docker build -t team-mcp-dashboard:1.0.3  apps/dashboard
docker build -t team-mcp-woocommerce:1.0.5 services/woocommerce-mcp
docker build -t inventory-mcp:local       services/inventory-mcp
docker build -t support-mcp:1.0.0         services/support-mcp
```

Match the tags in `deploy/helm/team-mcp-platform/values.yaml`.

**3. Create a secrets file outside the repo.** Never commit it.

```yaml
# ~/tmcp-secrets.yaml
secrets:
  mariadb:   { rootPassword: "<random>", password: "<random>" }
  postgres:  { password: "<random>" }
  woocommerce: { consumerKey: "ck_placeholder", consumerSecret: "cs_placeholder" }
  gateway:
    databaseUrl: "postgresql://postgres:<postgres password>@postgres:5432/team_mcp"
    encryptionKey: "<64 hex chars>"
  llm: { apiKey: "ollama" }
```

Generate values with `openssl rand -hex 16` (passwords) and `openssl rand -hex 32` (encryption key).

**4. Install**

```powershell
helm upgrade --install tmcp deploy/helm/team-mcp-platform -n team-mcp --create-namespace `
  -f deploy/values/values-local.yaml -f $HOME\tmcp-secrets.yaml
kubectl get pods -n team-mcp -w
```

**5. First run: admin and servers**

```powershell
./deploy/bootstrap.ps1 -Namespace team-mcp
```

It prints the admin API key once. Store it.

**6. Set up the store**

1. Open `http://store.localtest.me`, run the WordPress installer.
2. Install and activate WooCommerce. Enable **Cash on delivery**. Set **Settings → Permalinks → Post name**. Set **WooCommerce → Settings → Site visibility → Live**.
3. **WooCommerce → Settings → Advanced → REST API**: create a Read/Write key.
4. Put the key and secret in your secrets file, then:

```powershell
helm upgrade tmcp deploy/helm/team-mcp-platform -n team-mcp -f deploy/values/values-local.yaml -f $HOME\tmcp-secrets.yaml
kubectl rollout restart deployment/woocommerce-mcp -n team-mcp
```

## Using it

**Place an order:** open `http://store.localtest.me`, add a product to the cart, check out with Cash on delivery. The order appears under WooCommerce → Orders.

**Chat agent:** open `http://dashboard.localtest.me`, sign in with an API key, open **Chat Agent**. Try "Create a product named Test Mug priced at 9.99" (admin) or "What orders came in today?". The reply lists the tools that were called. Calls run as the signed-in user and appear in the audit log. A local 3B model takes up to about 90 seconds per answer.

**Members:** an admin invites a member on the **Team** page. Each member opens **My API Key** and generates their own key.

**External MCP client:**

```powershell
npx @modelcontextprotocol/inspector
```

Transport `Streamable HTTP`, URL `http://gateway.localtest.me/mcp`, connection `Via Proxy`, and under Authentication add the header `Authorization: Bearer <your key>`. For Claude Code:

```powershell
claude mcp add --transport http team-mcp http://gateway.localtest.me/mcp --header "Authorization: Bearer <your key>"
```

**Admin controls:** add, edit, disable or remove servers on **MCP Servers**; revoke or rotate keys on **Team**; see every call (user, server, tool, time, duration, outcome) on **Audit Log**.

## Tests

```powershell
$env:GATEWAY_URL = "http://gateway.localtest.me"
$env:ADMIN_KEY = "<admin key>"; $env:MEMBER_KEY = "<member key>"
$env:REVOKED_KEY = "<a revoked key>"   # optional
node deploy/verify-e2e.js
```

It checks auth, role filtering, real tool execution, write denial, argument validation and audit rows, and exits non-zero on failure.

## Production-like deployment (k3s on a VPS)

The same chart is used. Only values change (`deploy/values/values-prod.yaml`):

| Concern | Local | Production |
|---|---|---|
| Domains | `*.localtest.me` | your real domains (replace `yourdomain.com`) |
| Ingress class | `nginx` | `traefik` (k3s default) |
| TLS | none | cert-manager `letsencrypt-prod`, `tls:` hosts |
| Storage class | default | `local-path` |
| Images | local tags | registry-qualified (`ghcr.io/oyezaheer/...`), push first |
| Network policy | ingress namespace `ingress-nginx` | `kube-system` (Traefik) |
| WordPress URL | derived from store host | `wordpress.siteUrl: https://store.<domain>` |
| LLM | Ollama on the laptop | a hosted OpenAI-compatible endpoint (`baseUrl`, `model`, key from a secrets file) |

```bash
curl -sfL https://get.k3s.io | sh -
helm upgrade --install tmcp deploy/helm/team-mcp-platform -n team-mcp --create-namespace \
  -f deploy/values/values-prod.yaml -f /secure/path/secrets.yaml
```

`WP_HOME` and `WP_SITEURL` come from Helm values, so changing a hostname is a values change plus `helm upgrade`.

**Upgrade and rollback**

```powershell
helm upgrade tmcp deploy/helm/team-mcp-platform -n team-mcp -f ... -f ...
helm history tmcp -n team-mcp
helm rollback tmcp <revision> -n team-mcp
```

Database changes ship as Prisma migrations, applied automatically when the gateway starts.

## Security summary

- API keys are stored as SHA-256 hashes and shown once. They can be revoked and rotated.
- Upstream credentials are encrypted at rest with AES-256-GCM and never sent to browsers or MCP clients.
- Client tokens are not passed to upstreams. The gateway uses its own stored credential.
- Roles: admin (manage servers, members, audit, all tools) and member (read-only tools). Restricted tools are hidden from the tool list and rejected on both the REST route and `/mcp`.
- SSRF protection: upstream URLs are validated (no localhost, link-local, metadata hosts or private ranges except trusted in-cluster names), and redirects are rejected.
- Per-call timeouts: a slow or dead upstream never blocks listing or calls to others.
- Default-deny NetworkPolicies allow only the required paths. Docker Desktop does not enforce them. k3s does.

See `docs/system-design.md` and `docs/threat-model.md`.

## Stand-out items

Tool permissions, security hardening (SSRF, encrypted credentials, NetworkPolicies), upgrades and rollback with Helm, and a production values file. Not attempted: multi-store provisioning, OAuth, scaling.

## Known limitations

- NetworkPolicies are not enforced locally.
- The tool allowlist matches bare tool names, not server plus tool.
- The first admin key comes from `bootstrap.ps1`, not an in-app flow.
- WordPress and WooCommerce setup is manual (no WP-CLI init job).
- Chat quality depends on a small local model.