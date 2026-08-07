export const LIST_ATTR_STORAGE_KEY = 'ga4:listAttr:v1'
export const LEGACY_LIST_ATTRIBUTION_PREFIX = 'auchan:ga4:listAttribution:'
export const LIST_ATTRIBUTION_TTL_MS = 30 * 60 * 1000
export const LIST_ATTRIBUTION_MAX_ENTRIES = 100

export type ListAttrEntry = {
  listId: string
  listName: string
  position?: number
  ts: number
}

export type ListAttrMap = Record<string, ListAttrEntry>

export type ListAttribution = {
  item_list_id: string
  item_list_name: string
  index?: number
  ts: number
}

function canUseSessionStorage() {
  return typeof sessionStorage !== 'undefined'
}

function isExpired(entry: ListAttrEntry, now = Date.now()) {
  return !entry?.ts || now - entry.ts > LIST_ATTRIBUTION_TTL_MS
}

function toPublic(entry: ListAttrEntry): ListAttribution {
  return {
    item_list_id: entry.listId,
    item_list_name: entry.listName,
    ...(entry.position != null ? { index: entry.position } : {}),
    ts: entry.ts,
  }
}

function purgeExpired(map: ListAttrMap, now = Date.now()): ListAttrMap {
  const next: ListAttrMap = {}

  Object.keys(map).forEach(productId => {
    const entry = map[productId]

    if (entry && !isExpired(entry, now)) {
      next[productId] = entry
    }
  })

  return next
}

function evictLru(map: ListAttrMap, max = LIST_ATTRIBUTION_MAX_ENTRIES): ListAttrMap {
  const ids = Object.keys(map)

  if (ids.length <= max) return map

  const sorted = ids.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0))
  const toRemove = sorted.slice(0, ids.length - max)
  const next = { ...map }

  toRemove.forEach(id => {
    delete next[id]
  })

  return next
}

function clearLegacyKeys() {
  if (!canUseSessionStorage()) return

  try {
    const toRemove: string[] = []

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)

      if (key && key.startsWith(LEGACY_LIST_ATTRIBUTION_PREFIX)) {
        toRemove.push(key)
      }
    }

    toRemove.forEach(key => sessionStorage.removeItem(key))
  } catch {
  }
}

function readMap(): ListAttrMap {
  if (!canUseSessionStorage()) return {}

  try {
    const raw = sessionStorage.getItem(LIST_ATTR_STORAGE_KEY)

    if (!raw) {
      clearLegacyKeys()

      return {}
    }

    const parsed = JSON.parse(raw) as ListAttrMap

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return purgeExpired(parsed)
  } catch {
    return {}
  }
}

function writeMap(map: ListAttrMap) {
  if (!canUseSessionStorage()) return

  try {
    const cleaned = evictLru(purgeExpired(map))

    sessionStorage.setItem(LIST_ATTR_STORAGE_KEY, JSON.stringify(cleaned))
    clearLegacyKeys()
  } catch {
  }
}

export function peekListAttribution(productId?: string): ListAttribution | null {
  if (!productId) return null

  try {
    const map = readMap()
    const entry = map[productId]

    if (!entry || isExpired(entry)) {
      return null
    }

    return toPublic(entry)
  } catch {
    return null
  }
}

export function getListAttribution(productId?: string): ListAttribution | null {
  return peekListAttribution(productId)
}

export function resolveListAttribution(params: {
  productId?: string
  list?: string
  item_list_name?: string
  item_list_id?: string
  position?: number
}): {
  list?: string
  item_list_id?: string
  position?: number
} {
  const pixelName = params.item_list_name || params.list
  const pixelId = params.item_list_id
  const hasCompletePixel = Boolean(pixelId && pixelName)

  const stored = hasCompletePixel
    ? null
    : peekListAttribution(params.productId)

  return {
    list: pixelName || stored?.item_list_name,
    item_list_id: pixelId || stored?.item_list_id,
    position: params.position != null ? params.position : stored?.index,
  }
}

export function consumeListAttribution(productId?: string): ListAttribution | null {
  if (!productId) return null

  try {
    const map = readMap()
    const entry = map[productId]

    if (!entry || isExpired(entry)) {
      if (entry) {
        delete map[productId]
        writeMap(map)
      }

      return null
    }

    delete map[productId]
    writeMap(map)

    return toPublic(entry)
  } catch {
    return null
  }
}

export function consumeListAttributions(productIds: Array<string | undefined | null>) {
  const unique = Array.from(new Set(productIds.filter(Boolean) as string[]))

  if (!unique.length) return

  try {
    const map = readMap()
    let changed = false

    unique.forEach(id => {
      if (map[id]) {
        delete map[id]
        changed = true
      }
    })

    if (changed) writeMap(map)
  } catch {
  }
}

export function clearListAttributionStorage() {
  if (!canUseSessionStorage()) return

  try {
    sessionStorage.removeItem(LIST_ATTR_STORAGE_KEY)
    clearLegacyKeys()
  } catch {
  }
}
