import { GA4ItemData } from '../typings/events'

const REVIEWS_TIMEOUT_MS = 1500

const AVERAGE_RATING_QUERY = `
  query AverageRatingByProductId($productId: String!) {
    averageRatingByProductId(productId: $productId) {
      average
      total
    }
  }
`

interface AverageRatingResponse {
  data?: {
    averageRatingByProductId?: {
      average?: number | null
      total?: number | null
    } | null
  }
}

function hasReviewFields(item?: GA4ItemData) {
  return (
    item?.reviews_number !== undefined || item?.reviews_avg !== undefined
  )
}

export async function fetchProductReviewFields(
  productId?: string,
  existing?: GA4ItemData
): Promise<Pick<GA4ItemData, 'reviews_number' | 'reviews_avg'>> {
  if (hasReviewFields(existing)) {
    return {
      ...(existing?.reviews_number !== undefined
        ? { reviews_number: existing.reviews_number }
        : {}),
      ...(existing?.reviews_avg !== undefined
        ? { reviews_avg: existing.reviews_avg }
        : {}),
    }
  }

  if (!productId || typeof fetch === 'undefined') return {}

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timeoutId =
    controller &&
    window.setTimeout(() => controller.abort(), REVIEWS_TIMEOUT_MS)

  try {
    const response = await fetch('/_v/segment/graphql/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: controller?.signal,
      body: JSON.stringify({
        query: AVERAGE_RATING_QUERY,
        variables: { productId },
      }),
    })

    if (!response.ok) return {}

    const payload = (await response.json()) as AverageRatingResponse
    const averageRating = payload?.data?.averageRatingByProductId

    if (!averageRating) return {}

    return {
      ...(averageRating.total != null
        ? { reviews_number: averageRating.total }
        : {}),
      ...(averageRating.average != null
        ? { reviews_avg: averageRating.average }
        : {}),
    }
  } catch {
    return {}
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}
