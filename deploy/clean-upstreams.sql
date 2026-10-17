UPDATE "Upstream" SET enabled = false WHERE url LIKE '%localhost%';
UPDATE "Upstream" SET enabled = true WHERE url IN ('http://woocommerce-mcp:3003/mcp', 'http://inventory-mcp:3001/mcp', 'http://support-mcp:3004/mcp');
SELECT id, name, url, enabled FROM "Upstream";
