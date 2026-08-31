/** True when no sector filter is set, or sector is in the selected list. */
export function matchesSectorFilters(sector: string, sectorFilters: string[]): boolean {
  return sectorFilters.length === 0 || sectorFilters.includes(sector)
}
