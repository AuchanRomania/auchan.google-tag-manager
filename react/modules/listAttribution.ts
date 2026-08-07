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
    // ignore
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
    sessionStorage.setItem(
      LIST_ATTR_STORAGE_KEY,
      JSON.stringify(evictLru(purgeExpired(map)))
    )
    clearLegacyKeys()
  } catch {
    // ignore
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Fallback list id from page/dataLayer context when pixel omits item_list_id. */
export function resolveItemListId(itemListId?: string, listName?: string) {
  if (itemListId) return itemListId

  try {
    const searchParams = new URLSearchParams(window.location.search)
    const collectionId =
      searchParams.get('productClusterIds') ??
      searchParams
        .getAll('fq')
        .map(value => value.match(/productClusterIds:(\d+)/)?.[1])
        .find(Boolean)

    if (collectionId) return `collection-${collectionId}`

    const pageType = (window.dataLayer?.[0] as { pagetype?: string } | undefined)
      ?.pagetype
    const context = [...(window.dataLayer ?? [])]
      .reverse()
      .find(
        item =>
          (pageType === 'category' &&
            (item?.categoryId || item?.departmentId)) ||
          (pageType === 'search' &&
            (item?.siteSearchCategory || item?.siteSearchTerm))
      ) as
      | {
          categoryId?: string
          departmentId?: string
          siteSearchCategory?: string
          siteSearchTerm?: string
        }
      | undefined

    const categoryId = context?.categoryId ?? context?.siteSearchCategory

    if (categoryId) return `category-${categoryId}`
    if (context?.departmentId) return `department-${context.departmentId}`
    if (context?.siteSearchTerm) {
      return `search-${slugify(context.siteSearchTerm)}`
    }
    if (pageType === 'category') {
      const categoryPath = slugify(
        decodeURIComponent(window.location.pathname).replace(/\/c\/?$/, '')
      )

      if (categoryPath) return `category-${categoryPath}`
    }
  } catch {
    // ignore
  }

  const fallback = listName && slugify(listName)

  return fallback || undefined
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
    item_list_id:
      pixelId ||
      stored?.item_list_id ||
      resolveItemListId(undefined, pixelName || stored?.item_list_name),
    position: params.position != null ? params.position : stored?.index,
  }
}

export function saveListAttributions(
  entries: Array<{
    productId?: string
    listId?: string
    listName?: string
    position?: number
  }>
) {
  try {
    const map = readMap()
    const ts = Date.now()
    let changed = false

    entries.forEach(({ productId, listId, listName, position }) => {
      if (!productId || (!listId && !listName)) return

      const existing = map[productId]
      const nextListId = listId || existing?.listId || listName
      const nextListName = listName || existing?.listName || listId

      if (!nextListId || !nextListName) return

      map[productId] = {
        listId: nextListId,
        listName: nextListName,
        ...(position != null
          ? { position }
          : existing?.position != null
          ? { position: existing.position }
          : {}),
        ts,
      }
      changed = true
    })

    if (changed) writeMap(map)
  } catch {
    // ignore
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

export function consumeListAttributions(
  productIds: Array<string | undefined | null>
): ListAttrMap {
  const unique = Array.from(new Set(productIds.filter(Boolean) as string[]))
  const consumed: ListAttrMap = {}

  if (!unique.length) return consumed

  try {
    const map = readMap()
    let changed = false

    unique.forEach(id => {
      const entry = map[id]

      if (entry && !isExpired(entry)) {
        consumed[id] = entry
        delete map[id]
        changed = true
      } else if (entry) {
        delete map[id]
        changed = true
      }
    })

    if (changed) writeMap(map)
  } catch {
    // ignore
  }

  return consumed
}

export function clearListAttributionStorage() {
  if (!canUseSessionStorage()) return

  try {
    sessionStorage.removeItem(LIST_ATTR_STORAGE_KEY)
    clearLegacyKeys()
  } catch {
    // ignore
  }
}

/** Alias used by consent listeners. */
export function clearListAttributions() {
  clearListAttributionStorage()
}
