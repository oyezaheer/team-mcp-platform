# Team MCP Platform — WooCommerce Hosting & Unified AI Gateway on Kubernetes

A Kubernetes-based platform that centralizes multiple Model Context Protocol (MCP) servers behind a unified gateway. It provides team authentication, role-based tool access, audit logging, a React dashboard, and an AI chat interface for interacting with connected services.

Administrators manage upstream MCP servers and team access, while members discover and execute only the tools permitted by their role.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Local Development and Deployment](#local-development-and-deployment)
- [Accessing the Platform](#accessing-the-platform)
- [Authentication and Authorization](#authentication-and-authorization)
- [Audit Logging](#audit-logging)
- [Verification and Demo](#verification-and-demo)
- [Production Deployment](#production-deployment)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Architecture

```text
                    External MCP Clients
                  Claude Code / Cursor / IDEs
                              |
                              v
                     Unified MCP Endpoint
                         /mcp
                              |
               +--------------+--------------+
               |                             |
               v                             v
       Team MCP Gateway                React Dashboard
       Node.js / Express               Admin / Member UI
               |
       +-------+---------+
       |                 |
       v                 v
  Tool Authorization   Audit Logging
       |                 |
       +--------+--------+
                |
                v
         Upstream MCP Servers
          /       |       \
         v        v        v
   WooCommerce  Inventory  Support
         |
         v
   WordPress / WooCommerce
         |
         v
       MariaDB

   PostgreSQL: Users, API keys, upstreams,
               and audit records
```

The gateway aggregates upstream tools and namespaces them using the upstream identifier to avoid naming collisions. It authenticates requests, enforces role permissions, forwards authorized calls, and records audit events.

## Features

### Unified MCP Gateway
- Centralized Streamable HTTP MCP endpoint at `/mcp`.
- REST API for discovering and executing tools.
- Tool namespacing to prevent collisions between upstream servers.
- Server-side forwarding of upstream credentials.
- Support for multiple upstream MCP servers.

### Authentication and Role-Based Access Control
- API-key authentication for administrators and members.
- Admin access to all available tools.
- Member access restricted to read-only tools.
- Restricted tools filtered from member tool discovery.
- Direct execution of restricted tools rejected by authorization checks.
- Invalid or revoked API keys rejected.

### Audit Logging
- Records tool execution attempts and outcomes.
- Captures tool name, user attribution, timestamp, duration, and status.
- Supports audit filtering by status: `ALL`, `SUCCESS`, `DENIED`, and `ERROR`.
- Provides paginated audit records through the dashboard.

### Dashboard and AI Chat
- React-based dashboard for managing upstream servers and users.
- Tool discovery and execution through the gateway.
- AI chat interface for interacting with connected tools.
- Audit log viewer with status filters and pagination.

### Kubernetes Deployment
- Containerized gateway and dashboard.
- Kubernetes deployments and services.
- Helm-based deployment configuration.
- PostgreSQL persistence for platform data.

## Technology Stack

| Component | Technology |
|---|---|
| Backend gateway | Node.js, TypeScript, Express |
| MCP integration | Model Context Protocol SDK |
| Frontend | React, TypeScript, Vite |
| Database | PostgreSQL |
| Store integration | WooCommerce, WordPress, MariaDB |
| Containers | Docker |
| Orchestration | Kubernetes |
| Deployment configuration | Helm |
| API testing | PowerShell, HTTP requests, Node.js scripts |

## Prerequisites

Install the following tools:

- Node.js and npm
- Docker Desktop
- Kubernetes enabled in Docker Desktop, or another Kubernetes cluster
- `kubectl`
- Helm, if deploying through the Helm chart

Check the installations:

```powershell
node --version
npm --version
docker --version
kubectl version --client
helm version
```

## Local Development and Deployment

### 1. Clone or open the project

```powershell
cd C:\Users\<your-user>\team-mcp-platform
```

### 2. Build the gateway image

```powershell
docker build -t team-mcp-gateway:1.0.10 -f apps/gateway/Dockerfile apps/gateway
```

### 3. Build the dashboard image

```powershell
docker build -t team-mcp-dashboard:1.0.0 -f apps/dashboard/Dockerfile apps/dashboard
```

Use the image tags configured by your Kubernetes deployment. If you change a tag, update the deployment accordingly.

### 4. Deploy or update the gateway

For the existing `team-mcp` namespace:

```powershell
kubectl set image deployment/gateway gateway=team-mcp-gateway:1.0.10 -n team-mcp

kubectl rollout status deployment/gateway -n team-mcp
```

### 5. Deploy or update the dashboard

```powershell
kubectl rollout restart deployment/dashboard -n team-mcp

kubectl rollout status deployment/dashboard -n team-mcp
```

### 6. Check deployment health

```powershell
kubectl get pods -n team-mcp
kubectl get deployments -n team-mcp
kubectl get services -n team-mcp
```

Ensure the relevant pods are running and ready before testing the application.

> **Note:** The commands above update the existing gateway and dashboard deployments. A fresh installation also requires the appropriate Kubernetes resources, database, configuration, secrets, and upstream services. Follow the manifests and Helm values present in this repository for a new environment.

## Accessing the Platform

For the current local development setup:

| Component | Address |
|---|---|
| Dashboard | `http://localhost:8081` |
| Dashboard audit page | `http://localhost:8081/audit` |
| Gateway health endpoint | `http://localhost:14000/health` |
| REST tool discovery | `http://localhost:14000/api/mcp/tools` |
| Unified MCP endpoint | `http://localhost:14000/mcp` |

The gateway uses a local port-forward for access on port `14000`.

Start it in a dedicated PowerShell terminal and leave that terminal open:

```powershell
kubectl port-forward -n team-mcp deployment/gateway 14000:4000
```

The dashboard address may differ if you change its port-forward, service, or ingress configuration.

## Authentication and Authorization

Requests to protected gateway endpoints use a bearer API key.

Example PowerShell request:

```powershell
$headers = @{
    Authorization = "Bearer $env:MEMBER_KEY"
}

Invoke-RestMethod `
    -Uri "http://127.0.0.1:14000/api/mcp/tools" `
    -Headers $headers
```

Set `MEMBER_KEY` and `ADMIN_KEY` in your local environment using the valid keys issued by the application. Do not commit actual keys to Git.

### Role permissions

| Capability | Admin | Member |
|---|---|---|
| Discover available tools | All permitted tools | Read-only tools |
| Execute read-only tools | Yes | Yes |
| Execute restricted write tools | Yes, subject to upstream permissions | No |
| Manage team users and upstreams | Authorized admin actions | No |
| View administrative audit logs | Yes | No |

The gateway must enforce permissions on the server. Hiding a tool in the frontend alone is not sufficient authorization.

## Audit Logging

The audit dashboard displays execution events and allows administrators to filter by outcome.

Supported status filters:

- `ALL` — all audit outcomes
- `SUCCESS` — successful operations
- `DENIED` — authorization-denied operations
- `ERROR` — failed operations

Audit records should include the relevant user, tool, timestamp, execution duration, and outcome.

To inspect gateway logs:

```powershell
kubectl logs deployment/gateway -n team-mcp --tail=100
```

To inspect audit records in PostgreSQL, connect using the database credentials configured for your environment and query the `AuditLog` table.

## Verification and Demo

The repository includes an end-to-end verification script at `deploy/verify-e2e.js`.

### 1. Configure the test environment

In PowerShell, use the valid API keys already issued by your deployment:

```powershell
$env:GATEWAY_URL = "http://127.0.0.1:14000"
$env:ADMIN_KEY = "<your-admin-api-key>"
$env:MEMBER_KEY = "<your-member-api-key>"
```

Replace the placeholders in your terminal with your actual credentials. Never commit these values to the repository.

### 2. Run the verification script

```powershell
node .\deploy\verify-e2e.js
```

The existing script checks gateway health, admin tool discovery, member tool discovery, and rejection of an invalid API key. These checks do not by themselves verify every assignment requirement.

### 3. Demonstrate admin and member access

1. Open the dashboard and authenticate using an administrator API key.
2. Show the available tools, including permitted write operations.
3. Authenticate as a member and show the restricted read-only tool list.
4. Demonstrate that a direct request for a restricted tool is denied.
5. Open the audit page and show the resulting `DENIED` event.
6. Show the status filter and pagination.

Use a safe test environment when demonstrating write operations against WooCommerce.

### 4. External MCP client configuration

Configure a compatible MCP client to connect to:

```text
http://localhost:14000/mcp
```

Include the appropriate authorization header:

```text
Authorization: Bearer <your-api-key>
```

The URL and authentication configuration must match the environment where the gateway is running.

## Production Deployment

For a production deployment, configure the Kubernetes cluster, ingress, persistent storage, TLS, resource limits, and secrets before exposing the platform publicly.

If the repository contains the Helm chart and production values, inspect them before deploying:

```powershell
Get-ChildItem .\deploy\helm
Get-ChildItem .\deploy\values
```

Use the chart's documented configuration keys for the production deployment. Configure domain names and TLS certificates for the storefront, gateway, and dashboard as appropriate for your environment.

Do not assume that a production deployment is ready merely because the application works on localhost.

## Security Considerations

- Keep API keys, database passwords, WooCommerce credentials, and LLM API keys out of source control.
- Use Kubernetes Secrets or an appropriate external secret manager.
- Rotate credentials that have been exposed.
- Enforce authorization on every protected tool-execution path.
- Reject revoked and invalid API keys.
- Avoid logging bearer tokens, passwords, or other secrets.
- Restrict access to administrative endpoints and audit records.
- Use HTTPS for production traffic.
- Apply least-privilege permissions to upstream credentials.
- Configure resource limits and health probes appropriate to each workload.
- Back up persistent database data and test restoration procedures.

## Troubleshooting

### Gateway connection fails

Check the gateway pod:

```powershell
kubectl get pods -n team-mcp
kubectl logs deployment/gateway -n team-mcp --tail=100
```

If the port-forward is not running, restart it:

```powershell
kubectl port-forward -n team-mcp deployment/gateway 14000:4000
```

### HTTP 401 Unauthorized

Check that the correct, active API key is configured. Invalid, revoked, or incorrectly supplied keys should not authenticate.

### HTTP 403 Forbidden

The authenticated user may not have permission to execute the requested tool. Check the role and the server-side tool authorization rules.

### Upstream tool fails

Check whether the upstream MCP server is healthy, enabled, reachable, and configured with valid credentials. Inspect the gateway logs for upstream errors.

### Dashboard changes are not visible

Confirm that the dashboard image was rebuilt and that the deployment rollout completed. Refresh the page after the new version is available.

---

## Project Status

The current implementation includes the gateway, dashboard, role-based tool filtering and enforcement, audit logging, and Kubernetes deployment work. Verification should be performed against the current deployment and the actual configuration in this repository.

For additional setup details, consult the accompanying `SYSTEM_DESIGN.md` and `THREAT_MODEL.md` documents.
