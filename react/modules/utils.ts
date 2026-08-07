import {
  CartItem,
  GA4ItemData,
  Impression,
  Order,
  ProductOrder,
  Seller,
} from '../typings/events'
import { customDimensions } from './customDimensions'
import { resolveListAttribution } from './listAttribution'
import { getSessionItemStoreFields } from './sessionStore'

const ga4ItemFieldNames = [
  'item_store',
  'reviews_number',
  'reviews_avg',
  'in_stock',
  'item_list_id',
  'item_category4',
] as const

export function listIdFromListName(listName?: string | null): string | undefined {
  if (!listName) return undefined

  const slug = listName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return slug || undefined
}

export function getGA4ItemFields(item: GA4ItemData) {
  if (!item) return {}

  return ga4ItemFieldNames.reduce((fields, fieldName) => {
    return item[fieldName] === undefined
      ? fields
      : { ...fields, [fieldName]: item[fieldName] }
  }, {} as GA4ItemData)
}

export function getSeller(
  sellers: Seller[] = [],
  preferredSellerId?: string
): Seller | undefined {
  if (!sellers?.length) {
    return undefined
  }

  if (preferredSellerId) {
    const matchedSeller = sellers.find(
      seller => seller.sellerId === preferredSellerId
    )

    if (matchedSeller) return matchedSeller
  }

  const offerQty = (seller: Seller) =>
    getCommercialOffer(seller)?.AvailableQuantity ?? 0
  const offerPrice = (seller: Seller) => getCommercialOffer(seller)?.Price ?? 0

  const defaultSeller = sellers.find(seller => seller.sellerDefault)
  const availableSeller = sellers.find(seller => offerQty(seller) > 0)
  const pricedSeller = sellers.find(seller => offerPrice(seller) > 0)

  if (defaultSeller && offerQty(defaultSeller) > 0) {
    return defaultSeller
  }

  if (availableSeller) {
    return availableSeller
  }

  if (pricedSeller) {
    return pricedSeller
  }

  return defaultSeller || sellers[0]
}

function getCommercialOffer(seller?: Seller) {
  return seller?.commertialOffer ?? seller?.commercialOffer
}

export function getSellerItemFields(seller?: Seller) {
  if (!seller) return {}

  const availableQuantity = getCommercialOffer(seller)?.AvailableQuantity

  return {
    ...(seller.sellerId ? { item_store: seller.sellerId } : {}),
    ...(availableQuantity !== undefined
      ? { in_stock: availableQuantity > 0 }
      : {}),
  }
}

export function getPrice(seller?: Seller) {
  try {
    return getCommercialOffer(seller)?.Price
  } catch {
    return undefined
  }
}

function formatCategoriesHierarchy(
  categories: { [key: string]: string },
  value: string,
  index: number
) {
  const categoryHierarchyNumber = index + 1
  const isFirstCategory = categoryHierarchyNumber === 1
  const key = `item_category${isFirstCategory ? '' : categoryHierarchyNumber}`

  categories[key] = value
}

export function getCategoriesWithHierarchy(categoriesArray: string[]) {
  if (!categoriesArray || !categoriesArray.length) return

  const categoryString = getCategory(categoriesArray)
  const categories = splitIntoCategories(categoryString)

  if (!categories || !categoryString) return {}

  const categoriesFormatted: { [key: string]: string } = {}

  if (!categories || !categories.length) {
    formatCategoriesHierarchy(categoriesFormatted, categoryString, 0)
  } else {
    categories.forEach((category, index) => {
      formatCategoriesHierarchy(categoriesFormatted, category, index)
    })
  }

  return categoriesFormatted
}

type CategoryTreeNode = string | { id?: string; name?: string }

export function getProductCategoriesHierarchy(
  categories?: string[],
  categoryTree?: CategoryTreeNode[]
) {
  const treeNames = (categoryTree || [])
    .map(node => (typeof node === 'string' ? node : node?.name))
    .filter((name): name is string => Boolean(name))

  if (treeNames.length) {
    return getCategoriesWithHierarchy([treeNames.join('/')])
  }

  return getCategoriesWithHierarchy(categories || [])
}

export function getQuantity(seller?: Seller) {
  const availableQuantity = getCommercialOffer(seller)?.AvailableQuantity ?? 0

  return availableQuantity > 0 ? 1 : 0
}

export function getImpressions(impressions: Impression[], itemListId?: string) {
  if (!impressions || !impressions.length) return []

  const formattedImpressions = impressions.map(impression => {
    const { product, position } = impression
    const {
      productName,
      productId,
      productReference,
      sku,
      brand,
      categories,
    } = product

    const { itemId, seller, referenceId, name } = sku

    const price = getPrice(seller)
    const discount = getDiscount(seller)
    const quantity = getQuantity(seller)

    const categoriesHierarchy = getCategoriesWithHierarchy(categories)

    return {
      item_id: productId,
      item_name: productName,
      item_variant: itemId,
      item_brand: brand,
      index: position,
      discount,
      price,
      quantity,
      ...categoriesHierarchy,
      ...getGA4ItemFields(product),
      ...getGA4ItemFields(sku),
      ...getSellerItemFields(seller),
      ...(itemListId ? { item_list_id: itemListId } : {}),
      ...customDimensions({
        productReference,
        skuReference: referenceId?.Value,
        skuName: name,
        quantity,
      }),
    }
  })

  return formattedImpressions
}

export function getDiscount(seller?: Seller) {
  const offer = getCommercialOffer(seller)

  if (!offer?.PriceWithoutDiscount) return 0

  const { Price, PriceWithoutDiscount } = offer

  if (PriceWithoutDiscount <= Price) return 0

  try {
    return PriceWithoutDiscount - Price
  } catch {
    return 0
  }
}

export function getCategory(rawCategories: string[]) {
  if (!rawCategories || !rawCategories.length) {
    return
  }

  return removeStartAndEndSlash(rawCategories[0])
}

// Transform this: "/Apparel & Accessories/Clothing/Tops/"
// To this: "Apparel & Accessories/Clothing/Tops"
function removeStartAndEndSlash(category?: string) {
  return category?.replace(/^\/|\/$/g, '')
}

function splitIntoCategories(category?: string) {
  if (!category) return

  const splitted = category.split('/')

  return splitted
}

export function getPurchaseObjectData(order: Order) {
  return {
    affiliation: order.transactionAffiliation,
    coupon: order.coupon ? order.coupon : null,
    id: order.orderGroup,
    revenue: order.transactionTotal,
    shipping: order.transactionShipping,
    tax: order.transactionTax,
  }
}

export function getProductNameWithoutVariant(
  productNameWithVariant: string,
  variant: string
) {
  const indexOfVariant = productNameWithVariant.lastIndexOf(variant)

  if (indexOfVariant === -1 || indexOfVariant === 0) {
    return productNameWithVariant
  }

  return productNameWithVariant.substring(0, indexOfVariant - 1) // Removes the variant and the whitespace
}

function formatPurchaseProduct(product: ProductOrder) {
  const {
    name,
    skuName,
    id,
    brand,
    sku,
    price,
    quantity,
    categoryTree,
    productRefId,
    skuRefId,
  } = product

  const productName = getProductNameWithoutVariant(name, skuName)

  const item = {
    item_id: id,
    item_name: productName,
    item_brand: brand,
    item_variant: sku,
    price,
    quantity,
    ...getCategoriesWithHierarchy([categoryTree.join('/')]),
    ...getGA4ItemFields(product),
    ...(product.sellerId ? { item_store: product.sellerId } : {}),
    ...customDimensions({
      productReference: productRefId,
      skuReference: skuRefId,
      skuName,
      quantity,
    }),
  }

  return item
}

function toMajorCurrency(value: number, priceIsInt?: boolean) {
  return priceIsInt ? value / 100 : value
}

export function formatCartItemsAndValue(
  cartItems: CartItem[],
  options?: {
    dividePrice?: boolean
    useStoredListAttribution?: boolean
  }
) {
  let totalValue = 0.0

  if (!cartItems.length) return { items: [], totalValue }

  const useStoredListAttribution = options?.useStoredListAttribution !== false

  const items = cartItems.map((item: CartItem) => {
    const productName = getProductNameWithoutVariant(item.name, item.skuName)

    const shouldFormatPrice = item.priceIsInt ?? options?.dividePrice

    const hasSellingPrice =
      item.sellingPrice != null && item.sellingPrice > 0
    const sellingRaw = hasSellingPrice ? item.sellingPrice! : item.price

    const sellingIsInt = hasSellingPrice
      ? Boolean(item.priceIsInt ?? options?.dividePrice ?? true)
      : Boolean(shouldFormatPrice)

    const formattedPrice = toMajorCurrency(sellingRaw, sellingIsInt)

    const hasListPrice = item.listPrice != null && item.listPrice > 0
    const listRaw = hasListPrice
      ? item.listPrice!
      : hasSellingPrice && item.price > item.sellingPrice!
      ? item.price
      : undefined

    const formattedListPrice =
      listRaw != null
        ? toMajorCurrency(
            listRaw,
            hasListPrice
              ? Boolean(item.priceIsInt ?? options?.dividePrice ?? true)
              : Boolean(shouldFormatPrice)
          )
        : formattedPrice

    const discount = Math.max(0, formattedListPrice - formattedPrice)

    const itemBrand = item.brand ? item.brand : item.additionalInfo?.brandName

    const formattedCategories = getCategoriesWithHierarchy([item.category])

    const pixelListName =
      (item as CartItem & { item_list_name?: string; list?: string })
        .item_list_name ||
      (item as CartItem & { list?: string }).list
    const pixelListId = item.item_list_id
    const pixelPosition = (item as CartItem & { index?: number }).index

    const resolved = useStoredListAttribution
      ? resolveListAttribution({
          productId: item.productId,
          list: (item as CartItem & { list?: string }).list,
          item_list_name: pixelListName,
          item_list_id: pixelListId,
          position: pixelPosition,
        })
      : {
          list: pixelListName,
          item_list_id: pixelListId,
          position: pixelPosition,
        }

    const itemListName = resolved.list
    const itemListId = resolved.item_list_id
    const position = resolved.position

    totalValue += formattedPrice * item.quantity

    return {
      item_id: item.productId,
      item_brand: itemBrand,
      item_name: productName,
      item_variant: item.skuId,
      quantity: item.quantity,
      price: formattedPrice,
      discount,
      ...(itemListName ? { item_list_name: itemListName } : {}),
      ...(itemListId ? { item_list_id: itemListId } : {}),
      ...(position != null ? { index: position } : {}),
      ...formattedCategories,
      ...getGA4ItemFields(item),
      ...getSessionItemStoreFields(),
      ...customDimensions({
        productReference: item.productRefId,
        skuReference: item.referenceId,
        skuName: item.variant,
        quantity: item.quantity,
      }),
    }
  })

  return { items, totalValue }
}

export function getPurchaseItems(orderProducts: ProductOrder[]) {
  return orderProducts.map(formatPurchaseProduct)
}
