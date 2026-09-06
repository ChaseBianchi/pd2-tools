import type { IItem } from "../types";

export function isActivePlayerItem(item: IItem): boolean {
  const location = item.location;
  if (item.base?.type_code?.toLowerCase().includes("cha") && location?.storage === "Inventory") {
    return true;
  }
  return Boolean(
    location?.equipment && !location.equipment.includes("Switch") &&
    (location.zone === "Equipped" || !location.zone)
  );
}
