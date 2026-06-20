/**
 * Single source of truth for seat names, indexed by seat number (0 = human).
 * Used by the table seats, the human nameplate, the scoreboard, result lines,
 * and table-meld owner labels — so a player is named consistently everywhere.
 */
export const SEAT_NAMES = ['Sen', 'Mert', 'Can', 'Arda'] as const

export function seatName(seat: number): string {
  return SEAT_NAMES[seat] ?? `Oyuncu ${seat}`
}
