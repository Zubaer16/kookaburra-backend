import { parseMediaReconcileOptions } from './reconcile-options'

describe('03C-3 media reconciliation CLI safety', () => {
  it('starts in read-only mode and accepts only explicit apply', () => {
    expect(parseMediaReconcileOptions([])).toEqual({ apply: false, limit: 50 })
    expect(parseMediaReconcileOptions(['--limit=10'])).toEqual({
      apply: false,
      limit: 10,
    })
    expect(parseMediaReconcileOptions(['--apply', '--limit=100'])).toEqual({
      apply: true,
      limit: 100,
    })
  })

  it.each([
    '--dry-run=false',
    '--yes',
    '--limit=0',
    '--limit=-1',
    '--limit=1.5',
    '--limit=101',
    '--limit=Infinity',
  ])('rejects unexpected/unsafe option %s', (flag) => {
    expect(() => parseMediaReconcileOptions([flag])).toThrow()
  })
  it('rejects duplicate apply', () => {
    expect(() => parseMediaReconcileOptions(['--apply', '--apply'])).toThrow()
  })
})
