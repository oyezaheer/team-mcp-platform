
const READ_ONLY_TOOLS = new Set([
  "list_inventory",
  "get_inventory_item",
  "list_products",
  "list_orders",
  "get_order",
  "list_tickets",
  "get_ticket",
]);

export function canAccessTool(
  role: string | undefined,
  toolName: string
): boolean {
  if (role === "ADMIN") return true;
  if (role !== "MEMBER") return false;

  // Remove the upstream ID prefix from gateway-qualified tool names.
  const separator = toolName.lastIndexOf("__");
  const rawToolName =
    separator >= 0 ? toolName.slice(separator + 2) : toolName;

  return READ_ONLY_TOOLS.has(rawToolName);
}
