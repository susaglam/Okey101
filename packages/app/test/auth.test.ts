// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadGroups, getGroup, register, login, loginAsGuest, logout, currentUser, can,
  loadUsers, adminAddUser, adminUpdateUser, adminDeleteUser, adminAddGroup,
  adminDeleteGroup, adminSetGroupFeature, hasSession,
} from '../src/auth'

beforeEach(() => localStorage.clear())

describe('auth — groups seed', () => {
  it('seeds guest/normal/premium/admin with the right feature defaults', () => {
    const g = Object.fromEntries(loadGroups().map((x) => [x.id, x]))
    expect(g.guest!.features.islekMarkers).toBe(false)
    expect(g.guest!.features.hint).toBe(false)
    expect(g.normal!.features.islekMarkers).toBe(true)
    expect(g.premium!.features.dragAssists).toBe(true)
    expect(g.admin!.isAdmin).toBe(true)
    expect(g.guest!.builtin).toBe(true)
  })

  it('seeds an admin account on first user load', () => {
    const admin = loadUsers().find((u) => u.groupId === 'admin')
    expect(admin?.username).toBe('admin')
  })
})

describe('auth — register / login / guest', () => {
  it('registers a new user into the normal group and signs them in', () => {
    const r = register('Ayse', 'sifre123', 'a@b.c')
    expect(r.ok).toBe(true)
    const u = currentUser()
    expect(u?.kind).toBe('registered')
    expect(u?.name).toBe('Ayse')
    expect(u?.group.id).toBe('normal')
    expect(u?.isAdmin).toBe(false)
  })

  it('rejects duplicate usernames (case-insensitive)', () => {
    register('Mehmet', 'pw123')
    const r = register('mehmet', 'other')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/alınmış/i)
  })

  it('logs in with correct credentials and rejects wrong ones', () => {
    register('Veli', 'gizli12')
    logout()
    expect(login('Veli', 'wrong').ok).toBe(false)
    expect(login('Veli', 'gizli12').ok).toBe(true)
    expect(currentUser()?.name).toBe('Veli')
  })

  it('guest sign-in yields a fixed "Misafir" with no advantages', () => {
    loginAsGuest()
    const u = currentUser()
    expect(u?.kind).toBe('guest')
    expect(u?.name).toBe('Misafir')
    expect(can('islekMarkers')).toBe(false)
    expect(can('hint')).toBe(false)
  })

  it('no session → currentUser is null and hasSession false', () => {
    expect(hasSession()).toBe(false)
    expect(currentUser()).toBeNull()
  })

  it('admin login reaches the admin flag + all features', () => {
    expect(login('admin', 'admin').ok).toBe(true)
    const u = currentUser()
    expect(u?.isAdmin).toBe(true)
    expect(can('islekMarkers')).toBe(true)
  })
})

describe('auth — feature gating by group', () => {
  it('normal user sees the gated assists, guest does not', () => {
    register('NormalUser', 'pw123')
    expect(can('islekMarkers')).toBe(true)
    expect(can('hint')).toBe(true)
    expect(can('dragAssists')).toBe(true)
    loginAsGuest()
    expect(can('islekMarkers')).toBe(false)
  })
})

describe('auth — admin operations', () => {
  it('adds, updates and deletes users', () => {
    const add = adminAddUser('Bot1', 'pw', 'premium')
    expect(add.ok).toBe(true)
    const id = add.user!.id
    expect(loadUsers().find((u) => u.id === id)?.groupId).toBe('premium')

    adminUpdateUser(id, { groupId: 'normal', username: 'Bot1Renamed' })
    expect(loadUsers().find((u) => u.id === id)?.groupId).toBe('normal')
    expect(loadUsers().find((u) => u.id === id)?.username).toBe('Bot1Renamed')

    adminDeleteUser(id)
    expect(loadUsers().some((u) => u.id === id)).toBe(false)
  })

  it('adds a custom group, toggles its features, and deletes it (reassigning users)', () => {
    const g = adminAddGroup('VIP')
    expect(getGroup(g.id).name).toBe('VIP')
    adminSetGroupFeature(g.id, 'hint', true)
    expect(getGroup(g.id).features.hint).toBe(true)

    const u = adminAddUser('VipUser', 'pw', g.id).user!
    const del = adminDeleteGroup(g.id)
    expect(del.ok).toBe(true)
    // user reassigned to normal
    expect(loadUsers().find((x) => x.id === u.id)?.groupId).toBe('normal')
  })

  it('refuses to delete a built-in group', () => {
    expect(adminDeleteGroup('guest').ok).toBe(false)
  })
})
