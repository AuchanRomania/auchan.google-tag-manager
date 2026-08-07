import { Session } from 'vtex.session-client'

import { GA4ItemData } from '../typings/events'

let selectedStoreId: string | undefined

export function setSelectedStoreId(storeId?: string | null) {
  selectedStoreId = storeId || undefined
}

function readStoreIdFromDeliveryMethodsLocalStorage() {
  try {
    const raw = window.localStorage?.getItem('deliveryMethods')

    if (!raw) return undefined

    const parsed = JSON.parse(raw) as { selectedStoreId?: string | null }

    return parsed?.selectedStoreId || undefined
  } catch {
    return undefined
  }
}

export function getSelectedStoreId() {
  if (selectedStoreId) return selectedStoreId

  try {
    return (
      window.localStorage?.getItem('selectedStoreId') ||
      readStoreIdFromDeliveryMethodsLocalStorage() ||
      undefined
    )
  } catch {
    return undefined
  }
}

export function parseSelectedStoreIdFromSession(session?: Session) {
  try {
    const raw = session?.namespaces?.public?.deliveryMethods?.value

    if (!raw) return undefined

    const parsed = JSON.parse(raw) as { selectedStoreId?: string | null }

    return parsed?.selectedStoreId || undefined
  } catch {
    return undefined
  }
}

export function getSessionItemStoreFields(): Pick<GA4ItemData, 'item_store'> {
  const storeId = getSelectedStoreId()

  return storeId ? { item_store: storeId } : {}
}
