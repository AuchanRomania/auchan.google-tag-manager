const STORAGE_KEY = 'ga4:listAttr:v1'
const MAX_ENTRIES = 100
const TTL_MS = 60 * 60 * 1000

interface ListAttribution {
  listId?: string
  listName?: string
  position?: number
  ts: number
}

type ListAttributionStore = Record<string, ListAttribution>

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

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

    const pageType = window.dataLayer?.[0]?.pagetype
    const context = [...(window.dataLayer ?? [])]
      .reverse()
      .find(
        item =>
          (pageType === 'category' &&
            (item?.categoryId || item?.departmentId)) ||
          (pageType === 'search' &&
            (item?.siteSearchCategory || item?.siteSearchTerm))
      )
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
    // Missing page context must not block analytics events.
  }

  const fallback = listName && slugify(listName)

  return fallback || undefined
}

function readStore(): ListAttributionStore {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)

    if (!value) return {}

    const parsed = JSON.parse(value)

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? cleanup(parsed)
      : {}
  } catch {
    return {}
  }
}

function cleanup(store: ListAttributionStore, now = Date.now()) {
  return Object.keys(store).reduce((validEntries, productId) => {
    const attribution = store[productId]

    if (attribution?.ts && now - attribution.ts <= TTL_MS) {
      validEntries[productId] = attribution
    }

    return validEntries
  }, {} as ListAttributionStore)
}

function writeStore(store: ListAttributionStore) {
  try {
    const entries = Object.entries(store)
      .sort(([, first], [, second]) => second.ts - first.ts)
      .slice(0, MAX_ENTRIES)
    const cappedStore = entries.reduce(
      (result, [productId, attribution]) => {
        result[productId] = attribution

        return result
      },
      {} as ListAttributionStore
    )

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cappedStore))
  } catch {
    // Storage must never block analytics events.
  }
}

export function saveListAttributions(
  entries: Array<{
    productId: string
    listId?: string
    listName?: string
    position?: number
  }>
) {
  const store = readStore()
  const ts = Date.now()

  entries.forEach(({ productId, listId, listName, position }) => {
    if (!productId || (!listId && !listName)) return

    const existing = store[productId]

    store[productId] = existing
      ? {
          listId: existing.listId ?? listId,
          listName: existing.listName ?? listName,
          position: existing.position ?? position,
          ts,
        }
      : { listId, listName, position, ts }
  })

  writeStore(store)
}

export function consumeListAttributions(productIds: string[]) {
  const store = readStore()
  const consumed = productIds.reduce((result, productId) => {
    const attribution = store[productId]

    if (attribution) {
      result[productId] = attribution
      delete store[productId]
    }

    return result
  }, {} as ListAttributionStore)

  writeStore(store)

  return consumed
}

export function clearListAttributions() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage must never block consent changes.
  }
}
