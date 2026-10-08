import { roundToHundred, computeDeposit } from '@/lib/utils/pricing'

describe('roundToHundred', () => {
  it.each([[25050, 25000], [25150, 25200], [25049, 25000], [25051, 25100]])(
    'matches the charged rounding for %s COP', (value, expected) => {
      expect(roundToHundred(value)).toBe(expected)
    },
  )
  it('rounds 99999 up to 100000', () => {
    expect(roundToHundred(99999)).toBe(100000)
  })

  it('leaves a multiple of 100 unchanged', () => {
    expect(roundToHundred(80000)).toBe(80000)
  })
})

describe('computeDeposit', () => {
  it('matches the charged deposit for a halfway price', () => {
    expect(computeDeposit(50100, 50)).toBe(25000)
  })
  it('returns 30% of the total rounded to the nearest 100', () => {
    expect(computeDeposit(80000, 30)).toBe(24000)
  })

  it('returns 50% of the total when pct is 50', () => {
    expect(computeDeposit(81000, 50)).toBe(40500)
  })

  it('rounds the 50% of an odd total to the nearest 100', () => {
    expect(computeDeposit(81234, 50)).toBe(40600)
  })
})
