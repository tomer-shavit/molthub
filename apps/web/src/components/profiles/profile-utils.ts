import type { Fleet } from "@/lib/api";

export function getFleetNames(fleetIds: string[], fleets: Fleet[]): string {
  if (fleetIds.length === 0) return "All fleets";
  const names = fleetIds
    .map((id) => fleets.find((f) => f.id === id)?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Unknown fleets";
}
