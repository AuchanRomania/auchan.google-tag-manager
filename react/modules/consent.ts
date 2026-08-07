import { clearListAttributionStorage } from './listAttribution'

export const ANALYTICS_CONSENT_GROUPS = ['C0002']

type OneTrustApi = {
  OnConsentChanged?: (callback: (event?: unknown) => void) => void
}

function getActiveGroups(): string | undefined {
  return (window as Window & { OnetrustActiveGroups?: string }).OnetrustActiveGroups
}

function groupTokenPresent(groups: string, groupId: string) {
  return `,${groups},`.includes(`,${groupId},`)
}

export function hasAnalyticsConsent(): boolean {
  const groups = getActiveGroups()

  if (typeof groups === 'undefined') return true
  if (!groups.replace(/,/g, '').trim()) return true

  return ANALYTICS_CONSENT_GROUPS.some(id => groupTokenPresent(groups, id))
}

export function syncListAttributionWithConsent() {
  try {
    if (!hasAnalyticsConsent()) {
      clearListAttributionStorage()
    }
  } catch {
    // ignore
  }
}

export function wireConsentClearListAttribution() {
  const sync = () => syncListAttributionWithConsent()
  let attached = false

  const attachOnConsentChanged = (): boolean => {
    if (attached) return true

    try {
      const oneTrust = (window as Window & { OneTrust?: OneTrustApi }).OneTrust

      if (!oneTrust?.OnConsentChanged) return false

      oneTrust.OnConsentChanged(sync)
      attached = true

      return true
    } catch {
      return false
    }
  }

  attachOnConsentChanged()

  try {
    const win = window as Window & {
      OptanonWrapper?: () => void
      OneTrust?: OneTrustApi
    }
    const previous = win.OptanonWrapper

    win.OptanonWrapper = () => {
      try {
        if (typeof previous === 'function') previous()
      } catch {
        // ignore
      }

      attachOnConsentChanged()
      sync()
    }
  } catch {
    // ignore
  }

  sync()

  let attempts = 0
  const maxAttempts = 40
  const intervalId = window.setInterval(() => {
    attempts += 1

    if (attachOnConsentChanged() || attempts >= maxAttempts) {
      window.clearInterval(intervalId)
      sync()
    }
  }, 500)
}
