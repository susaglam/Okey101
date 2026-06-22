/**
 * Single source of truth for seat names, indexed by seat number (0 = human).
 * Used by the table seats, the human nameplate, the scoreboard, result lines,
 * and table-meld owner labels — so a player is named consistently everywhere.
 */
export const SEAT_NAMES = ['Sen', 'Mert', 'Can', 'Arda'] as const

// Live names. Seat 0 (the human) is always "Sen"; seats 1–3 (the bots) can be
// renamed from Settings. Kept as module state so the many seatName() call sites
// (table seats, nameplate, scoreboard, result lines, meld labels) need no extra
// prop threading — call setBotNames() on startup and whenever the setting changes.
let liveNames: string[] = [...SEAT_NAMES]

/** Apply custom bot names (seats 1–3). Empty/blank entries fall back to defaults. */
export function setBotNames(botNames: readonly string[] | undefined): void {
  liveNames = [
    'Sen',
    botNames?.[0]?.trim() || SEAT_NAMES[1],
    botNames?.[1]?.trim() || SEAT_NAMES[2],
    botNames?.[2]?.trim() || SEAT_NAMES[3],
  ]
}

export function seatName(seat: number): string {
  return liveNames[seat] ?? `Oyuncu ${seat}`
}
