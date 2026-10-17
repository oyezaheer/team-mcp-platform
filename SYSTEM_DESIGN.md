# System Design & Architecture Tradeoffs

This document details the internal design decisions, protocol flows, and architectural tradeoffs of the Team MCP Platform.

---

## 1. Architectural Decisions

### Streamable HTTP vs. stdio / Legacy SSE
* **Decision**: All MCP servers and the Gateway communicate over **MCP Streamable HTTP** (`POST /mcp` with streaming response support) as defined in the 2024–2026 Model Context Protocol specification.
* **Tradeoff**: Standard stdio transport requires launching a subprocess per connection, which does not scale across a multi-tenant Kubernetes cluster and makes containerized networking awkward. Streamable HTTP allows standard HTTP/REST load balancers, Kubernetes Services, and Ingress controllers to route traffic reliably with connection reuse and graceful timeouts.

### Custom WooCommerce MCP Implementation
* **Decision**: Built from scratch using Node.js/TypeScript and `@modelcontextprotocol/sdk`, communicating with WordPress via the native **WooCommerce REST API (v3)** secured with **OAuth 1.0a HMAC-SHA1**.
* **Why REST API over WP-CLI**: WP-CLI requires direct shell or filesystem access to the WordPress container, breaking microservice boundaries and preventing network isolation. The REST API allows strict network segregation: the WooCommerce MCP server only needs HTTP ingress to WordPress port 80, keeping database files and PHP execution separated.

---

## 2. Tool Aggregation, Collision Namespacing & Routing

When an MCP client queries `tools/list`, the Gateway:
1. Fetches all registered upstreams where `enabled == true` from PostgreSQL.
2. Simultaneously queries `tools/list` from each enabled upstream with a strict **10,000ms connection timeout**.
3. **Collision Namespacing**: If two different servers expose a tool with the same name (e.g. `get_order`), the Gateway prefixes tool names with the upstream ID:
   ```
   ${upstream.id}__${tool.name}
   ```
   Example: `cmv96r2us000g0ims9nrwl5f1__list_orders`
4. The tool description is enriched with the server name (`[WooCommerce Store] List WooCommerce orders`) so the LLM has contextual awareness of which service to invoke.
5. When `tools/call` is invoked:
   * The Gateway splits on the `__` separator.
   * Looks up the upstream by ID.
   * Injects the server-side credential (Bearer token or OAuth header).
   * Forwards the call directly to the target upstream with a **15,000ms call timeout**.
   * Logs duration, user ID, tool name, and success/error status to the `AuditLog` table.

---

## 3. Resilience & Failure Containment

* **Slow or Dead Upstreams**: If an upstream pod crashes or hangs, `Promise.race` enforces connection (10s) and execution (15s) deadlines. A failing server returns an isolated error object (`isError: true`) and **never breaks tool listing or calls to other healthy upstreams**.
* **Database Volume Locking (`Recreate` Strategy)**: MariaDB and WordPress use Single-Node PersistentVolumes (`ReadWriteOnce`). In standard Kubernetes rolling updates, a new pod is started before the old one terminates, causing volume multi-attach errors. Both deployments enforce `strategy: { type: Recreate }`, guaranteeing clean unmounting and InnoDB lock release before new replicas boot.
* **Startup Probes for I/O Lags**: Heavy databases on local VMs can take 30–60 seconds for InnoDB crash recovery. Applying `startupProbe` with `failureThreshold: 30` prevents Kubernetes kubelet from prematurely restarting MariaDB during startup.

---

## 4. Local vs. Production VPS Considerations

| Feature | Local Kubernetes (Docker Desktop / Kind) | Production VPS (k3s / Cloud) |
| :--- | :--- | :--- |
| **Ingress Controller** | `ingress-nginx` or port-forwarding | `traefik` (built-in to k3s) |
| **TLS / SSL** | Plain HTTP (`store.local`, `dashboard.local`) | Automated Let's Encrypt via `cert-manager` |
| **Storage Class** | HostPath / Docker Desktop driver | `local-path` (k3s) or Cloud CSI block storage |
| **DNS Resolution** | `/etc/hosts` local resolution | Public A/CNAME records with wildcard SSL |
| **Secret Management** | Kubernetes Opaque Secrets | SealedSecrets / HashiCorp Vault / ExternalSecrets |
| **Database Scalability**| Single-replica MariaDB & Postgres | High-availability PostgreSQL cluster (Stolon/CrunchyData) |
