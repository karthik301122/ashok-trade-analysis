/** Score 0–100 from boolean checklist items (pattern forming progress). */
export function scoreFromFlags(flags: boolean[]): number {
  if (!flags.length) return 0
  const passed = flags.filter(Boolean).length
  return Math.round((passed / flags.length) * 100)
}
