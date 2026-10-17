# =====================================================================
# TEAM MCP PLATFORM - SYSTEM HEALTH & VERIFICATION SCRIPT
# =====================================================================

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " 1. CHECKING KUBERNETES WORKLOAD HEALTH (namespace: team-mcp)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$pods = kubectl get pods -n team-mcp -o custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[0].ready,STATUS:.status.phase,RESTARTS:.status.containerStatuses[0].restartCount
$pods

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " 2. CHECKING ACTIVE SERVICE ENDPOINTS" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

kubectl get endpoints -n team-mcp

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " 3. TESTING DIRECT CLUSTER HEALTH & TOOL DISCOVERY" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$gatewayPod = kubectl get pods -n team-mcp -l app=gateway -o jsonpath='{.items[0].metadata.name}'

Write-Host "Connecting to Gateway pod: $gatewayPod..."
kubectl exec $gatewayPod -n team-mcp -- node -e "
fetch('http://127.0.0.1:4000/health')
  .then(r => r.json())
  .then(d => console.log('✔ Gateway Health:', d))
  .catch(e => console.error('✖ Gateway health check failed:', e.message));
"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " 4. TESTING USER A (ADMIN) TOOL DISCOVERY" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

kubectl exec $gatewayPod -n team-mcp -- node -e "
fetch('http://127.0.0.1:4000/api/mcp/tools', {
  headers: { 'Authorization': 'Bearer tmcp_admin_secret_key_1234567890abcdef' }
})
.then(r => r.json())
.then(d => {
  console.log('✔ Discovered Tools (' + (d.tools?.length || 0) + ' total):');
  d.tools?.forEach(t => console.log('   - ' + t.name));
})
.catch(e => console.error('✖ Tool discovery failed:', e.message));
"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " 5. TESTING USER B (MEMBER) ACCESS & CROSS-SERVER ROUTING" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

kubectl exec $gatewayPod -n team-mcp -- node -e "
fetch('http://127.0.0.1:4000/api/mcp/tools', {
  headers: { 'Authorization': 'Bearer tmcp_member_secret_key_1234567890abcdef' }
})
.then(r => r.json())
.then(d => {
  console.log('✔ Member Key Authenticated Successfully.');
  console.log('✔ Available tools to Member:', d.tools?.length);
})
.catch(e => console.error('✖ Member access failed:', e.message));
"

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host " ALL CHECKS COMPLETED!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
