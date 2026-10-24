/**
 * End-to-end verification for the Team MCP Gateway.
 *
 * Required env vars (no defaults, no secrets in source):
 *   GATEWAY_URL   e.g. http://127.0.0.1:14000
 *   ADMIN_KEY     API key of an ADMIN user
 *   MEMBER_KEY    API key of a MEMBER user
 * Optional:
 *   REVOKED_KEY   a key that has been revoked (expects 401)
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

const { GATEWAY_URL, ADMIN_KEY, MEMBER_KEY, REVOKED_KEY } = process.env;

const missing = ["GATEWAY_URL", "ADMIN_KEY", "MEMBER_KEY"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function api(path, { key, method = "GET", body } = {}) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

const baseName = (t) => t.name.slice(t.name.indexOf("__") + 2);

async function main() {
  console.log(`Gateway: ${GATEWAY_URL}\n`);
  const startedAt = Date.now() - 5000; // small clock-skew allowance

  // 1. Health
  const health = await api("/health");
  check("Gateway health returns 200", health.status === 200);

  // 2. Authentication
  const bad = await api("/api/mcp/tools", { key: "tmcp_invalid_key_000000000000" });
  check("Invalid key rejected with 401", bad.status === 401, `got ${bad.status}`);

  const none = await api("/api/mcp/tools");
  check("Missing key rejected with 401", none.status === 401, `got ${none.status}`);

  if (REVOKED_KEY) {
    const rev = await api("/api/mcp/tools", { key: REVOKED_KEY });
    check("Revoked key rejected with 401", rev.status === 401, `got ${rev.status}`);
  } else {
    console.log("SKIP  Revoked key test (set REVOKED_KEY to enable)");
  }

  // 3. Tool discovery and role filtering
  const adminList = await api("/api/mcp/tools", { key: ADMIN_KEY });
  const memberList = await api("/api/mcp/tools", { key: MEMBER_KEY });
  const adminTools = adminList.json?.tools ?? [];
  const memberTools = memberList.json?.tools ?? [];

  check("Admin discovers tools", adminList.status === 200 && adminTools.length > 0, `${adminTools.length} tools`);
  check("Member discovers tools", memberList.status === 200 && memberTools.length > 0, `${memberTools.length} tools`);
  check("Admin sees more tools than member", adminTools.length > memberTools.length);

  const writeNames = ["create_product", "update_order_status"];
  const memberWrites = memberTools.filter((t) => writeNames.includes(baseName(t)));
  check("Member list hides write tools", memberWrites.length === 0);

  const adminWrites = adminTools.filter((t) => writeNames.includes(baseName(t)));
  check("Admin list includes write tools", adminWrites.length === writeNames.length, `${adminWrites.length}/${writeNames.length}`);

  const servers = new Set(memberTools.map((t) => t.upstreamId));
  check("Member sees tools from 2+ servers", servers.size >= 2, `${servers.size} servers`);

  // 4. Real tool execution as member
  const readTool = memberTools.find((t) => baseName(t) === "list_inventory");
  if (readTool) {
    const call = await api("/api/mcp/tools/call", {
      key: MEMBER_KEY,
      method: "POST",
      body: { name: readTool.name, arguments: {} },
    });
    const text = call.json?.result?.content?.[0]?.text ?? "";
    check("Member executes read tool (list_inventory)", call.status === 200 && text.length > 0, `status ${call.status}`);
  } else {
    check("Member executes read tool (list_inventory)", false, "tool not found in member list");
  }

  // 5. Member write denial (tool is taken from the admin list, since member cannot see it)
  const writeTool = adminWrites.find((t) => baseName(t) === "create_product");
  if (writeTool) {
    const denied = await api("/api/mcp/tools/call", {
      key: MEMBER_KEY,
      method: "POST",
      body: { name: writeTool.name, arguments: { name: "e2e-should-not-exist", regularPrice: "1.00" } },
    });
    check("Member write call denied with 403", denied.status === 403, `got ${denied.status}`);
  } else {
    check("Member write call denied with 403", false, "create_product not found in admin list");
  }

  // 6. Bad arguments are a client error, not a 502
  if (readTool) {
    const badArgs = await api("/api/mcp/tools/call", {
      key: MEMBER_KEY,
      method: "POST",
      body: { name: readTool.name, arguments: [] },
    });
    check("Array arguments rejected with 400", badArgs.status === 400, `got ${badArgs.status}`);
  }

  // 7. Audit access control
  const memberAudit = await api("/api/admin/audit", { key: MEMBER_KEY });
  check("Member cannot read audit log (403)", memberAudit.status === 403, `got ${memberAudit.status}`);

  // 8. Audit content
  const audit = await api("/api/admin/audit", { key: ADMIN_KEY });
  const rows = audit.json
    ? Object.values(audit.json).find((v) => Array.isArray(v)) ?? []
    : [];
  check("Admin reads audit log", audit.status === 200 && rows.length > 0, `${rows.length} rows on first page`);

  const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= startedAt);

  const okRow = recent.find((r) => r.toolName === "list_inventory" && r.status === "SUCCESS");
  check("Audit has SUCCESS row for list_inventory", !!okRow);
  check("SUCCESS row has user, server and duration", !!(okRow?.user?.email && okRow?.upstream?.name && okRow?.durationMs != null));

  const deniedRow = recent.find((r) => r.toolName === "create_product" && r.status === "DENIED");
  check("Audit has DENIED row for create_product", !!deniedRow);
  check("DENIED row records the server", !!deniedRow?.upstream?.name);

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});