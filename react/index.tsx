import { canUseDOM } from 'vtex.render-runtime'

import { sendEnhancedEcommerceEvents } from './modules/enhancedEcommerceEvents'
import { sendExtraEvents } from './modules/extraEvents'
import { sendLegacyEvents } from './modules/legacyEvents'
import { clearListAttributionStorage } from './modules/listAttribution'
import { wireConsentClearListAttribution } from './modules/consent'
import { PixelMessage } from './typings/events'

export {
  setPageTypeFromRoute,
  setUserDataFromSession,
  syncSelectedStoreFromSession,
  default as GtmContext,
} from './GtmContext'

export async function handleEvents(e: PixelMessage) {
  await sendEnhancedEcommerceEvents(e)
  sendExtraEvents(e)
  sendLegacyEvents(e)
}

export default function GoogleTagManagerPixel() {
  return null
}

if (canUseDOM) {
  const win = window as Window & {
    __auchanGtmPixelBootstrapped?: boolean
    __auchanClearGa4ListAttr?: () => void
  }

  if (!win.__auchanGtmPixelBootstrapped) {
    win.__auchanGtmPixelBootstrapped = true

    window.addEventListener('message', (e: MessageEvent) => {
      void handleEvents(e as PixelMessage)
    })

    win.__auchanClearGa4ListAttr = clearListAttributionStorage
    wireConsentClearListAttribution()
  }
}
