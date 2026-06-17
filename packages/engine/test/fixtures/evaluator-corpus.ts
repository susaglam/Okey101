import { tileFromString } from '../../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
// okey is 7M throughout this corpus (gösterge 6M)
export const OKEY = tileFromString('7M')
export const WINNING_PAIRS = h(
  '1R','1R','3K','3K','5M','5M','7S','7S','9R','9R','11K','11K','13M','13M') // 7 pairs
export const NOT_WINNING = h(
  '1R','2R','5K','8M','9S','10R','11K','13S','2M','4M','6K','8S','10M','12R')
