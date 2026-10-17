# Team MCP Platform: WooCommerce Hosting & Unified AI Gateway on Kubernetes

A production-grade WooCommerce hosting platform and centralized Model Context Protocol (MCP) gateway running on Kubernetes.

An administrator registers upstream MCP servers once in the dashboard, and team members can immediately access all tools through a single, aggregated Streamable HTTP MCP endpoint (compatible with Claude Code, Cursor, and MCP Inspector) and through an in-dashboard AI Chat Agent.

---

## 🏛 System Architecture Overview

```
                        +----------------------------+
                        |  External MCP Clients      |
                        | (Claude Code, Cursor, IDE) |
                        +--------------+-------------+
                                       |
                                       v (Streamable HTTP /mcp with User API Key)
+-----------------------------------------------------------------------------------+
| Kubernetes Cluster (`team-mcp` namespace)                                         |
|                                                                                   |
|   +-----------------------+                    +------------------------------+   |
|   |   React Dashboard     |                    |       PostgreSQL 16          |   |
|   | (Admin / Member UI)   |                    | (Users, Keys, Upstreams,     |   |
|   +-----------+-----------+                    |  Audit Logs)                 |   |
|               |                                +--------------+---------------+   |
|               v                                               ^                   |
|   +-----------------------------------------------------------+---------------+   |
|   |                      Team MCP Gateway (Node.js/Express)                   |   |
|   |  - Unified MCP Endpoint: /mcp                                             |   |
|   |  - REST Tool Proxy: /api/mcp/tools                                        |   |
|   |  - Chat Agent Loop: /api/chat                                             |   |
|   |  - Upstream Isolation & Collision Namespacing: ${upstreamId}__${tool}      |   |
|   |  - Server-side Credential Injection & Audit Logging                       |   |
|   +-------+-----------------------------+-----------------------------+-------+   |
|           |                             |                             |           |
|           v                             v                             v           |
|  +--------------------+      +--------------------+      +--------------------+   |
|  |  WooCommerce MCP   |      |   Inventory MCP    |      |    Support MCP     |   |
|  |  (Custom Server)   |      |  (Port 3001 /mcp)  |      |  (Port 3004 /mcp)  |   |
|  +--------+-----------+      +--------------------+      +--------------------+   |
|           |                                                                       |
|           v (OAuth 1.0a HMAC-SHA1)                                                |
|  +--------------------+                                                           |
|  |  WordPress + Woo   | <---> [ MariaDB 11.4 ]                                    |
|  |  Storefront        |       (Persistent Volume)                                 |
|  +--------------------+                                                           |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart: Local Kubernetes Setup

### Prerequisites
* Docker Desktop (with Kubernetes enabled), Minikube, Kind, or k3d.
* `kubectl` and `helm` (v3+).

### 1. Install & Deploy via Helm

Deploy the entire platform with one command using the local values file:

```bash
# Add namespace if not present
kubectl create namespace team-mcp --dry-run=client -o yaml | kubectl apply -f -

# Deploy via Helm
helm upgrade --install team-mcp ./deploy/helm/team-mcp-platform \
  -n team-mcp \
  -f ./deploy/values/values-local.yaml
```

### 2. Verify Workload Health
Ensure all pods are in `Running` and `Ready` state:

```bash
kubectl get pods -n team-mcp
```
All workloads (`gateway`, `mariadb`, `postgres`, `wordpress`, `woocommerce-mcp`, `inventory-mcp`, `support-mcp`) feature dedicated `startupProbe`, `readinessProbe`, and `livenessProbe` checks with persistent storage volume recovery.

---

## 🌐 Production VPS Deployment (k3s / Cloud)

Deploying to a single VPS or cloud-managed k3s node uses the **exact same Helm chart** with zero code modifications:

```bash
helm upgrade --install team-mcp ./deploy/helm/team-mcp-platform \
  -n team-mcp \
  -f ./deploy/values/values-prod.yaml \
  --set ingress.hosts.store="store.yourdomain.com" \
  --set ingress.hosts.gateway="mcp.yourdomain.com" \
  --set ingress.hosts.dashboard="dashboard.yourdomain.com"
```

### What Changes in Production (`values-prod.yaml`):
1. **StorageClass**: Uses `local-path` (k3s standard) or cloud CSI (e.g. `gp3`, `civo-volume`) instead of local hostpath.
2. **Ingress Controller**: Uses `traefik` (built into k3s) with automatic TLS certificate provisioning via `cert-manager` and Let's Encrypt.
3. **Resource Guardrails**: Hardened requests and limits (up to 2000m CPU / 2Gi memory for WooCommerce/MariaDB).
4. **Secret Management**: Passwords and OAuth secrets injected via Kubernetes Secrets or external secret operators (HashiCorp Vault / AWS Secrets Manager).

---

## 🧪 Definition of Done: Verification Guide

### 1. Store Checkout Flow
1. Access the storefront at `http://localhost:8080` (or `http://store.local` via Ingress).
2. Browse products, add an item to the shopping cart, and proceed to checkout.
3. Select **Cash on Delivery (COD)** and complete the order.
4. Log into `/wp-admin` (`admin` / `zaheerkhan2026`) and verify the order is marked `Processing`.

### 2. Chat Agent (User A - Admin)
1. Open the dashboard at `http://localhost:5173` (or `http://dashboard.local`).
2. Log in with User A API Key: `tmcp_admin_secret_key_1234567890abcdef`.
3. In the Chat tab, enter:
   > *"Create a new product named 'Vintage Leather Jacket' with price 89.99."*
4. The agent executes `create_product` through the gateway. Refresh the storefront to see the product live.
5. Place an order for this product on the store, then ask the agent:
   > *"What orders were placed today?"*
6. The agent calls `list_orders` and returns your order details.

### 3. External MCP Client (User B - Member)
Connect Claude Code, Cursor, or MCP Inspector to the gateway:
* **Transport**: `Streamable HTTP`
* **URL**: `http://localhost:4000/mcp`
* **Headers**: `Authorization: Bearer tmcp_member_secret_key_1234567890abcdef`

#### Cross-Server Execution:
Run a prompt requiring tools from two distinct servers:
> *"Check the inventory stock for product 12 and verify if there are any open support tickets for this customer."*
* Gateway routes tool calls to `inventory-mcp` (`check_stock`) and `support-mcp` (`get_customer_tickets`).

### 4. Team & Access Control
1. **Key Revocation**: In the dashboard, click **Revoke** on User B's key. Their next MCP request is immediately rejected with HTTP `401 Unauthorized`.
2. **Upstream Disabling**: Toggle an upstream server to **Disabled** in the Servers tab. Its tools immediately vanish from both the chat agent and external MCP clients.
3. **Pod Failure Resilience**: Terminate a pod (`kubectl delete pod -l app=support-mcp -n team-mcp`). The gateway handles the dead upstream gracefully with clear timeout responses, while other upstreams continue functioning uninterrupted.
4. **Audit Trail**: Open the **Audit Log** tab to inspect every single tool call with timestamps, calling user attribution, target upstream, execution duration (ms), and outcome (`SUCCESS`/`ERROR`).
