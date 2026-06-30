/**
 * Single source of truth for seat names, indexed by seat number (0 = human).
 * Used by the table seats, the human nameplate, the scoreboard, result lines,
 * and table-meld owner labels — so a player is named consistently everywhere.
 */
export const SEAT_NAMES = ['Sen', 'Mert', 'Can', 'Arda'] as const

// Live names. Seat 0 is the local human; their label comes from the signed-in
// user's profile (falls back to "Sen"). Seats 1–3 (the bots) can be renamed from
// Settings. Kept as module state so the many seatName() call sites (table seats,
// nameplate, scoreboard, result lines, meld labels) need no prop threading — call
// setHumanName()/setBotNames() on startup and whenever they change.
let humanName: string = SEAT_NAMES[0]
let botNamesState: string[] = [SEAT_NAMES[1], SEAT_NAMES[2], SEAT_NAMES[3]]

function rebuild(): void {
  liveNames = [humanName, ...botNamesState]
}

let liveNames: string[] = [...SEAT_NAMES]

/** Set the local human's display name (seat 0). Blank → "Sen". */
export function setHumanName(name: string | undefined): void {
  humanName = name?.trim() || SEAT_NAMES[0]
  rebuild()
}

/** Apply custom bot names (seats 1–3). Empty/blank entries fall back to defaults.
 *  Does NOT touch the human's name (seat 0). */
export function setBotNames(botNames: readonly string[] | undefined): void {
  botNamesState = [
    botNames?.[0]?.trim() || SEAT_NAMES[1],
    botNames?.[1]?.trim() || SEAT_NAMES[2],
    botNames?.[2]?.trim() || SEAT_NAMES[3],
  ]
  rebuild()
}

/** ONLINE: set every seat's display name directly from the table's occupants (the
 *  local human may sit at ANY seat, and other seats can be real humans, so the
 *  offline "seat 0 = me, 1–3 = bots" model doesn't apply). Seat-indexed; blanks fall
 *  back to a generic label. */
export function setSeatNames(names: readonly (string | undefined)[]): void {
  liveNames = Array.from({ length: 4 }, (_, i) => names[i]?.trim() || `Oyuncu ${i + 1}`)
}

export function seatName(seat: number): string {
  return liveNames[seat] ?? `Oyuncu ${seat}`
}
