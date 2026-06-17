import { tileFromString } from '../../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
// okey is 7M throughout this corpus (gösterge 6M)
export const OKEY = tileFromString('7M')
// 9-group(4) + 5-group(4) + 1R2R3R run + 11K12K13K run = 14 tiles, full cover
export const WINNING_PER = h(
  '9R','9K','9M','9S',
  '5R','5K','5M','5S',
  '1R','2R','3R',
  '11K','12K','13K')
// Same as WINNING_PER but 7M (okey) is wild for 3R → still 14 tiles, full cover
export const WINNING_WITH_OKEY = h(
  '9R','9K','9M','9S',
  '5R','5K','5M','5S',
  '1R','2R','7M',
  '11K','12K','13K')
export const WINNING_PAIRS = h(
  '1R','1R','3K','3K','5M','5M','7S','7S','9R','9R','11K','11K','13M','13M') // 7 pairs
export const NOT_WINNING = h(
  '1R','2R','5K','8M','9S','10R','11K','13S','2M','4M','6K','8S','10M','12R')
