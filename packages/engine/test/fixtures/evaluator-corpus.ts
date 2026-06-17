import { tileFromString } from '../../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
// okey is 7M throughout this corpus (gösterge 6M)
export const OKEY = tileFromString('7M')
export const WINNING_PER = h(
  '1R','2R','3R',   // run red
  '4K','5K','6K',   // run black
  '9S','9R','9M',   // group 9
  '11S','12S','13S',// run yellow
  '8M','8K')        // pair-as-leftover? no -> see pairs corpus
export const WINNING_WITH_OKEY = h(
  '1R','2R','3R',
  '4K','5K','6K',
  '9S','9R','9M',
  '11S','12S','13S',
  '7M','5R')        // 7M acts as okey(wild) completing e.g. 5R-6R(missing)-> used as wild in a run; arrangement-dependent
export const WINNING_PAIRS = h(
  '1R','1R','3K','3K','5M','5M','7S','7S','9R','9R','11K','11K','13M','13M') // 7 pairs
export const NOT_WINNING = h(
  '1R','2R','5K','8M','9S','10R','11K','13S','2M','4M','6K','8S','10M','12R')
