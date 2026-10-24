param(
  [string]$Namespace = "team-mcp-test",
  [string]$AdminEmail = "admin@example.com",
  [string]$GatewayUrl = "http://gateway.localtest.me"
)
$ErrorActionPreference = "Stop"

function Invoke-Psql($sql) {
  $sql | kubectl exec -i -n $Namespace deployment/postgres -- psql -U postgres -d team_mcp
}

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$key  = "tmcp_" + (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
$hash = -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString("x2") })

Invoke-Psql @"
INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
VALUES ('usr_' || md5(random()::text), '$AdminEmail', 'Admin', 'ADMIN', now(), now())
ON CONFLICT (email) DO NOTHING;
INSERT INTO "ApiKey" (id, name, "keyHash", "keyPrefix", "userId")
SELECT 'key_' || md5(random()::text), 'bootstrap', '$hash', '$($key.Substring(0,12))', id FROM "User" WHERE email = '$AdminEmail';
"@ | Out-Null

$h = @{ Authorization = "Bearer $key" }
foreach ($s in @(
  @{ name="WooCommerce MCP"; url="http://woocommerce-mcp:3003/mcp"; description="WooCommerce products and orders" },
  @{ name="Inventory MCP";   url="http://inventory-mcp:3001/mcp";   description="Inventory tools" },
  @{ name="Support MCP";     url="http://support-mcp:3004/mcp";     description="Support tickets" })) {
  Invoke-RestMethod -Method Post -Uri "$GatewayUrl/api/admin/upstreams" -Headers $h -ContentType "application/json" -Body ($s | ConvertTo-Json) -DisableKeepAlive | Out-Null
}

Write-Host "Admin: $AdminEmail"
Write-Host "API key (shown once, store it now): $key"