@echo off
echo =====================================================================
echo  STARTING TEAM MCP PLATFORM LOCAL ACCESS
echo =====================================================================
echo Forwarding ports:
echo  - WordPress Store: http://localhost:8080
echo  - Team MCP Gateway API: http://localhost:4000
echo  - React Dashboard: http://localhost:5173
echo =====================================================================

start "WP Store (Port 8080)" cmd /k "kubectl port-forward --address 127.0.0.1 svc/wordpress 8080:80 -n team-mcp"
start "MCP Gateway (Port 4000)" cmd /k "kubectl port-forward --address 127.0.0.1 svc/gateway 4000:4000 -n team-mcp"
cd apps\dashboard
start "React Dashboard (Port 5173)" cmd /k "npm run dev"
cd ..\..

timeout /t 3 >nul
start http://localhost:8080
start http://localhost:5173

echo.
echo All services started and opened in your browser!
echo Admin Login Key: tmcp_admin_secret_key_1234567890abcdef
echo Member Login Key: tmcp_member_secret_key_1234567890abcdef
pause
