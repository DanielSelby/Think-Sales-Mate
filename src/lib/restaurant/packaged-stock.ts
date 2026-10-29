import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function assertRestaurantPackagedStockAvailable(
  admin: AdminClient,
  orgId: string,
  locationId: string,
  requestedItems: Array<{ menuItemId: string; quantity: number }>,
) {
  const requestedByItem = new Map<string, number>();
  for (const requested of requestedItems) {
    requestedByItem.set(requested.menuItemId, (requestedByItem.get(requested.menuItemId) ?? 0) + requested.quantity);
  }
  const menuItemIds = [...requestedByItem.keys()];
  if (!menuItemIds.length) return;
  const { data: menuItems, error: itemError } = await admin.from("restaurant_menu_items")
    .select("id, name, item_type").eq("org_id", orgId).in("id", menuItemIds);
  if (itemError) throw new Error(`Could not verify Restaurant menu items: ${itemError.message}`);
  const packagedItems = (menuItems ?? []).filter((item) => item.item_type === "packaged");
  if (!packagedItems.length) return;
  const { data: stocks, error: stockError } = await admin.from("restaurant_packaged_item_stock")
    .select("menu_item_id, quantity").eq("org_id", orgId).eq("location_id", locationId)
    .in("menu_item_id", packagedItems.map((item) => item.id));
  if (stockError) throw new Error(`Could not verify Restaurant packaged stock: ${stockError.message}`);
  for (const item of packagedItems) {
    const available = Number(stocks?.find((stock) => stock.menu_item_id === item.id)?.quantity ?? 0);
    const requested = requestedByItem.get(item.id) ?? 0;
    if (available < requested) {
      throw new Error(`Insufficient stock for ${item.name}: ${available} available, ${requested} requested.`);
    }
  }
}
