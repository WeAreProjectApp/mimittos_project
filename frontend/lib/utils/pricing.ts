export function roundToHundred(value: number): number {
  // Match Python's nearest-even rounding, which determines the actual charge.
  const hundreds = value / 100
  const lower = Math.floor(hundreds)
  const rounded = hundreds - lower === 0.5
    ? lower + (lower % 2 === 0 ? 0 : 1)
    : Math.round(hundreds)
  return rounded * 100
}

export function computeDeposit(total: number, depositPct: number): number {
  return roundToHundred((total * depositPct) / 100)
}
