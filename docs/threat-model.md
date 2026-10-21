# Threat Model

## Assets
- WooCommerce products, orders, customer information, and store credentials.
- Upstream MCP credentials.
- Gateway API keys, user identities, and audit logs.
- Administrative access to upstream registration and team membership.

## Trust boundaries
External MCP clients and chat requests are untrusted. The gateway is the authentication and routing boundary. Upstream MCP servers are separate services and should be treated as potentially faulty or compromised.

## Shared upstream credentials
A member may invoke every operation permitted by the gateway and the upstream credential, even though the member never sees that credential. Restrict exposed tools by role where possible, validate inputs, and use upstream credentials with the least privileges available.

## Client tokens
A member's gateway API key authenticates that member to the gateway. It should not be forwarded as an upstream credential. The gateway authenticates to each upstream using server-side configuration and records which member initiated the call.

## Untrusted upstreams and prompt injection
Tool descriptions and tool results from upstreams are untrusted data. They must not override system instructions, reveal secrets, or authorize unrelated actions. Validate tool inputs and outputs, limit timeouts and payload sizes, and require confirmation for sensitive destructive actions where appropriate.

## Cross-member risks
A leaked API key could let another person act as that member until the key is revoked. Hash keys at rest, support revocation, avoid logging raw keys or credentials, enforce admin-only management routes, and audit actions with user attribution. Verify that one member cannot manage another member's keys or upstream configuration.

## Operational risks and limitations
A compromised upstream may receive data included in its tool arguments. Admin-added URLs may create SSRF risks if arbitrary destinations are accepted. Production hardening should validate destinations, restrict network access, use least-privilege service accounts, and apply NetworkPolicies. These protections must be verified in the running deployment; this document alone does not establish that they are implemented.
