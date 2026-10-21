# System Design and Tradeoffs

## Architecture
- WordPress and WooCommerce provide the storefront and order management.
- The WooCommerce MCP server exposes product and order operations through MCP Streamable HTTP.
- Inventory and Support MCP servers provide additional tools.
- The gateway authenticates users, discovers tools from enabled upstreams, routes tool calls, and records audit events.
- The dashboard provides upstream management and user-facing controls.
- PostgreSQL stores gateway data and audit records.

## Tool aggregation and routing
The gateway discovers tools from enabled upstream servers and exposes them through a single endpoint. Tool names must remain unambiguous when multiple servers expose the same name; use a stable server prefix or another deterministic collision strategy. Calls should be routed to the upstream that owns the selected tool.

## Failure handling
A failed or slow upstream should not prevent calls to healthy upstreams. Apply request timeouts, return clear tool errors, and surface upstream health in the dashboard. Verify this behavior by disabling an upstream and by terminating one upstream pod.

## Identity and audit
Each client authenticates with its own gateway API key. Store only a hash of API keys, where supported by the implementation. Record the authenticated user, upstream, tool, outcome, and timestamp for tool calls. Never return upstream credentials to members.

## Production tradeoffs
The same Helm chart should support local Kubernetes and a VPS using separate values files. Production should configure DNS and TLS, a suitable storage class and backups, resource limits, ingress restrictions, and Kubernetes Secrets. Do not commit actual credentials to Git. Document any features that are not implemented rather than claiming they are complete.
