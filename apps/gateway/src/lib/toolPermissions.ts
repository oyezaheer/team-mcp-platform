const READ_ONLY_TOOLS = new Set([
  "list_inventory",
  "get_inventory_item",
  "list_products",
  "list_orders",
  "get_order",
]);

export function canAccessTool(
  role: string | undefined,
  toolName: string
): boolean {
  if (role === "ADMIN") return true;
  if (role === "MEMBER") return READ_ONLY_TOOLS.has(toolName);
  return false;
}
