import { Session } from 'vtex.session-client'

let selectedStoreId: string | undefined

export function setSelectedStoreId(storeId?: string | null) {
  selectedStoreId = storeId || undefined
}

export function getSelectedStoreId() {
  if (selectedStoreId) return selectedStoreId

  try {
    const deliveryMethods = window.localStorage?.getItem('deliveryMethods')

    return (
      window.localStorage?.getItem('selectedStoreId') ||
      (deliveryMethods
        ? JSON.parse(deliveryMethods).selectedStoreId || undefined
        : undefined)
    )
  } catch {
    return
  }
}

export function syncSelectedStoreFromSession(session?: Session) {
  try {
    const raw = session?.namespaces?.public?.deliveryMethods?.value
    const storeId = raw ? JSON.parse(raw).selectedStoreId : undefined

    setSelectedStoreId(storeId)
  } catch {
    setSelectedStoreId()
  }
}
