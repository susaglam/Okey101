import type { VariantConfig } from './config'
import type { Tile } from './tile'

export function buildDeck(config: VariantConfig): Tile[] {
  const deck: Tile[] = []
  for (const color of config.colors) {
    for (let n = 1; n <= config.tilesPerColor; n++) {
      for (let c = 0; c < config.copies; c++) deck.push({ number: n, color, kind: 'NUMBER' })
    }
  }
  for (let j = 0; j < config.falseJokers; j++) deck.push({ kind: 'FALSE_JOKER' })
  return deck
}
