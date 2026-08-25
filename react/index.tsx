import { useEffect } from 'react'
import { canUseDOM, useRuntime } from 'vtex.render-runtime'
import { Session, useRenderSession } from 'vtex.session-client'

import { sendEnhancedEcommerceEvents } from './modules/enhancedEcommerceEvents'
import { sendExtraEvents } from './modules/extraEvents'
import { sendLegacyEvents } from './modules/legacyEvents'
import { clearListAttributions } from './modules/listAttribution'
import { syncSelectedStoreFromSession } from './modules/sessionStore'
import { PixelMessage } from './typings/events'

const pageTypeByRouteId: Record<string, string> = {
  'store.home': 'home',
  'store.category': 'category',
  'store.department': 'category',
  'store.search#category': 'category',
  'store.search#department': 'category',
  'store.search#subcategory': 'category',
  'store.search#brand': 'category',
  'store.search.product-comparison#category': 'category',
  'store.search.product-comparison#department': 'category',
  'store.search.product-comparison#subcategory': 'category',
  'store.search.product-comparison#brand': 'category',
  'store.product': 'product',
  'store.product.product-comparison': 'product',
  'store.search': 'search',
  'store.search.product-comparison': 'search',
  'store.cart': 'cart',
  'store.checkout': 'checkout',
  'store.orderplaced': 'order_placed',
}

function updateDataLayer(data: Record<string, unknown>, pushEvent = true) {
  window.dataLayer = window.dataLayer || []
  window.dataLayer[0] = { ...window.dataLayer[0], ...data }
  if (pushEvent) window.dataLayer.push(data)
}

async function hashEmailAddress(email: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const encodedEmail = new TextEncoder().encode(normalizedEmail)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedEmail)

    return Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return
  }
}

export function setPageTypeFromRoute(routeId: string) {
  const pagetype = pageTypeByRouteId[routeId]

  if (pagetype) updateDataLayer({ pagetype })
}

export async function setUserDataFromSession(session?: Session) {
  const profile = session?.namespaces?.profile
  const isAuthenticated = profile?.isAuthenticated?.value === 'true'

  if (!isAuthenticated) {
    updateDataLayer({ userData: { loggedStatus: 'guest' } }, false)
    return
  }

  const userId = profile?.id?.value
  const email =
    profile?.email?.value ??
    session?.namespaces?.authentication?.storeUserEmail?.value

  const loggedUserData = {
    loggedStatus: 'logged',
    ...(userId ? { userId } : {}),
  }

  updateDataLayer({ userData: loggedUserData }, false)

  if (!email) return

  const emailHash = await hashEmailAddress(email)

  if (emailHash) {
    updateDataLayer({ userData: { ...loggedUserData, emailHash } }, false)
  }
}

export default function GoogleTagManager() {
  const { route } = useRuntime()
  const { loading, session } = useRenderSession()

  useEffect(() => setPageTypeFromRoute(route.id), [route.id])
  useEffect(() => {
    if (!loading) {
      syncSelectedStoreFromSession(session)
      void setUserDataFromSession(session)
    }
  }, [loading, session])
  useEffect(() => {
    let activeGroups = new Set(
      (window.OnetrustActiveGroups ?? '').split(',').filter(Boolean)
    )
    const handleConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail
      const nextGroups = new Set(
        Array.isArray(detail)
          ? detail
          : (window.OnetrustActiveGroups ?? '').split(',').filter(Boolean)
      )

      if ([...activeGroups].some(group => !nextGroups.has(group))) {
        clearListAttributions()
      }

      activeGroups = nextGroups
    }

    window.addEventListener('OneTrustGroupsUpdated', handleConsentChange)

    return () =>
      window.removeEventListener('OneTrustGroupsUpdated', handleConsentChange)
  }, [])

  return null
}

export function handleEvents(e: PixelMessage) {
  sendEnhancedEcommerceEvents(e)
  sendExtraEvents(e)
  sendLegacyEvents(e)
}

if (canUseDOM) {
  window.addEventListener('message', handleEvents)
}
