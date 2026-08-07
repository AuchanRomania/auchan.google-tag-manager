import updateEcommerce from './updateEcommerce'
import {
  PixelMessage,
  ProductOrder,
  Impression,
  CartItem,
} from '../typings/events'
import { AnalyticsEcommerceProduct } from '../typings/gtm'
import {
  purchase,
  selectItem,
  selectPromotion,
  viewItem,
  viewItemList,
  viewPromotion,
  addToCart,
  removeFromCart,
  addPaymentInfo,
  beginCheckout,
  addShippingInfo,
  viewCart,
  search,
  login,
  refund,
  addToWishlist,
  signUp,
  share,
} from './gaEvents'
import {
  getCategory,
  getSeller,
  getProductNameWithoutVariant,
  getPurchaseObjectData,
} from './utils'
import {
  customDimensionSkuAvailability,
  productViewSkuReference,
} from './customDimensions'
import { getSelectedStoreId } from './sessionStore'

export async function sendEnhancedEcommerceEvents(e: PixelMessage) {
  switch (e.data.eventName) {
    case 'vtex:productView': {
      const {
        productId,
        productReference,
        selectedSku,
        productName,
        brand,
        categories,
      } = e.data.product

      const seller = getSeller(selectedSku.sellers, getSelectedStoreId())
      const productAvailableQuantity =
        seller?.commertialOffer?.AvailableQuantity ??
        seller?.commercialOffer?.AvailableQuantity

      const isAvailable = customDimensionSkuAvailability(
        productAvailableQuantity
      )

      // Product summary list title. Ex: 'List of products'
      const list = e.data.list ? { actionField: { list: e.data.list } } : {}

      let price

      try {
        price =
          seller?.commertialOffer?.Price ?? seller?.commercialOffer?.Price
      } catch {
        price = undefined
      }

      const data = {
        ecommerce: {
          detail: {
            ...list,
            products: [
              {
                brand,
                category: getCategory(categories),
                id: productId,
                variant: selectedSku.itemId,
                name: productName,
                dimension1: productReference ?? '',
                dimension2: productViewSkuReference(e.data.product) ?? '',
                dimension3: selectedSku.name,
                dimension4: isAvailable,
                price,
              },
            ],
          },
        },
        event: 'productDetail',
      }

      updateEcommerce('productDetail', data)
      await viewItem(e.data)

      return
    }

    case 'vtex:productClick': {
      const { product, position } = e.data
      const {
        productName,
        brand,
        categories,
        sku,
        productId,
        productReference,
      } = product

      // Product summary list title. Ex: 'List of products'
      const list = e.data.list ? { actionField: { list: e.data.list } } : {}

      let price

      try {
        const seller = getSeller(
          sku?.sellers ?? product.items?.[0]?.sellers ?? []
        )

        price =
          seller?.commertialOffer?.Price ?? seller?.commercialOffer?.Price
      } catch {
        price = undefined
      }

      const data = {
        event: 'productClick',
        ecommerce: {
          click: {
            ...list,
            products: [
              {
                brand,
                category: getCategory(categories),
                id: productId,
                variant: sku.itemId,
                name: productName,
                dimension1: productReference ?? '',
                dimension2: sku.referenceId?.Value ?? '',
                dimension3: sku.name,
                price,
                position,
              },
            ],
          },
        },
      }

      selectItem(e.data)
      updateEcommerce('productClick', data)

      return
    }

    case 'vtex:addToCart': {
      addToCart(e.data)

      return
    }

    case 'vtex:removeFromCart': {
      const { items } = e.data

      const data = {
        ecommerce: {
          currencyCode: e.data.currency,
          remove: {
            products: items.map(item => ({
              brand: item.brand,
              category: item.category,
              id: item.productId,
              variant: item.skuId,
              name: item.name, // Product name
              price:
                item.priceIsInt === true
                  ? `${item.price / 100}`
                  : `${item.price}`,
              quantity: item.quantity,
              dimension1: item.productRefId ?? '',
              dimension2: item.referenceId ?? '', // SKU reference id
              dimension3: item.variant, // SKU name (variant)
            })),
          },
        },
        event: 'removeFromCart',
      }

      removeFromCart(e.data)
      updateEcommerce('removeFromCart', data)

      return
    }

    case 'vtex:orderPlaced': {
      const order = e.data

      const ecommerce = {
        purchase: {
          actionField: getPurchaseObjectData(order),
          products: order.transactionProducts.map((product: ProductOrder) =>
            getProductObjectData(product)
          ),
        },
      }

      const data = {
        // @ts-ignore
        event: 'orderPlaced',
        ...order,
        // The name ecommerceV2 was introduced as a fix, so it is possible that some clients
        // were using this as it was called before (ecommerce). For that reason,
        // it will also be sent as ecommerce to the dataLayer.
        ecommerce,
        // This variable is called ecommerceV2 so it matches the variable name present on the checkout
        // This way, users can have one single tag for checkout and orderPlaced events
        ecommerceV2: {
          ecommerce,
        },
      }

      purchase(order)
      updateEcommerce('orderPlaced', data)

      return
    }

    case 'vtex:productImpression': {
      const { currency, list, impressions } = e.data

      const parsedImpressions = (impressions || []).map(
        getProductImpressionObjectData(list)
      )

      const data = {
        event: 'productImpression',
        ecommerce: {
          currencyCode: currency,
          impressions: parsedImpressions,
        },
      }

      const themeListActive = Boolean(
        (window as Window & {
          __auchanViewItemList?: { active?: boolean }
        }).__auchanViewItemList?.active
      )
      const hasListId = Boolean(e.data.item_list_id)

      if (!themeListActive || hasListId) {
        viewItemList(e.data)
      }

      updateEcommerce('productImpression', data)

      return
    }

    case 'vtex:cartLoaded': {
      const { orderForm } = e.data

      const data = {
        event: 'checkout',
        ecommerce: {
          checkout: {
            actionField: {
              step: 1,
            },
            products: orderForm.items.map(getCheckoutProductObjectData),
          },
        },
      }

      updateEcommerce('checkout', data)

      break
    }

    case 'vtex:promoView': {
      viewPromotion(e.data)

      break
    }

    case 'vtex:promotionClick': {
      selectPromotion(e.data)

      break
    }

    case 'vtex:addPaymentInfo': {
      addPaymentInfo(e.data)

      break
    }

    case 'vtex:beginCheckout': {
      beginCheckout(e.data)

      break
    }

    case 'vtex:addShippingInfo': {
      addShippingInfo(e.data)

      break
    }

    case 'vtex:viewCart': {
      viewCart(e.data)

      break
    }

    case 'vtex:login': {
      login(e.data)

      break
    }

    case 'vtex:signUp': {
      signUp(e.data)

      break
    }

    case 'vtex:refund': {
      refund(e.data)

      break
    }

    case 'vtex:addToWishlist': {
      addToWishlist(e.data)

      break
    }

    case 'vtex:search': {
      search(e.data)

      break
    }

    case 'vtex:share': {
      share(e.data)

      break
    }

    default: {
      break
    }
  }
}

function getProductObjectData(product: ProductOrder) {
  const productName = getProductNameWithoutVariant(
    product.name,
    product.skuName
  )

  return {
    brand: product.brand,
    category: product.categoryTree?.join('/'),
    id: product.id, // Product id
    variant: product.sku, // SKU id
    name: productName, // Product name
    price: product.price,
    quantity: product.quantity,
    dimension1: product.productRefId ?? '',
    dimension2: product.skuRefId ?? '',
    dimension3: product.skuName, // SKU name (only variant)
  }
}

function getProductImpressionObjectData(list: string) {
  return ({ product, position }: Impression) => ({
    brand: product.brand,
    category: getCategory(product.categories),
    id: product.productId, // Product id
    variant: product.sku.itemId, // SKU id
    list,
    name: product.productName,
    position,
    price: `${product.sku.seller.commertialOffer.Price}`,
    dimension1: product.productReference ?? '',
    dimension2: product.sku.referenceId?.Value ?? '',
    dimension3: product.sku.name, // SKU name (variation only)
  })
}

function getCheckoutProductObjectData(
  item: CartItem
): AnalyticsEcommerceProduct {
  const productName = getProductNameWithoutVariant(item.name, item.skuName)
  const unitPrice =
    item.sellingPrice != null && item.sellingPrice > 0
      ? item.sellingPrice
      : item.price
  const priceIsInt = item.priceIsInt ?? item.sellingPrice != null

  return {
    id: item.productId, // Product id
    variant: item.id, // SKU id
    name: productName, // Product name without variant
    category: item.category,
    brand: item.additionalInfo?.brandName ?? '',
    price: priceIsInt ? unitPrice / 100 : unitPrice,
    quantity: item.quantity,
    dimension1: item.productRefId ?? '',
    dimension2: item.referenceId ?? '', // SKU reference id
    dimension3: item.skuName,
  }
}
