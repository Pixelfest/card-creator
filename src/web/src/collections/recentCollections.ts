// "Recently opened" Collections live only in this browser's localStorage (docs/spec.md,
// section 3). The server never lists Collections.

export type RecentCollection = { id: string; name: string; openedAt: string }

export const MAX_RECENT = 20
const STORAGE_KEY = 'cardcreator.recentCollections'

/** Puts the visited Collection first, without duplicates, keeping at most MAX_RECENT. */
export function withVisit(
  recent: RecentCollection[],
  visit: { id: string; name: string },
  now: Date,
): RecentCollection[] {
  const entry = { id: visit.id, name: visit.name, openedAt: now.toISOString() }
  return [entry, ...recent.filter((r) => r.id !== visit.id)].slice(0, MAX_RECENT)
}

export function without(recent: RecentCollection[], collectionId: string): RecentCollection[] {
  return recent.filter((r) => r.id !== collectionId)
}

/** Reads the stored list, dropping anything that isn't a well-formed entry. */
export function parseRecent(raw: string | null): RecentCollection[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (r): r is RecentCollection =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        typeof r.openedAt === 'string' &&
        !Number.isNaN(Date.parse(r.openedAt)),
    )
    .slice(0, MAX_RECENT)
}

/** "opened today", "opened yesterday" or "opened N days ago", by local calendar day. */
export function openedLabel(openedAt: string, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(new Date(openedAt))) / 86_400_000)
  if (days <= 0) return 'opened today'
  if (days === 1) return 'opened yesterday'
  return `opened ${days} days ago`
}

// Storage can be unavailable (private windows, blocked site data); the list is a convenience.

export function loadRecent(): RecentCollection[] {
  try {
    return parseRecent(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function save(recent: RecentCollection[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

export function recordVisit(visit: { id: string; name: string }) {
  save(withVisit(loadRecent(), visit, new Date()))
}

export function forget(collectionId: string) {
  save(without(loadRecent(), collectionId))
}
