import {
  CartItem,
  GA4ItemData,
  Impression,
  Order,
  ProductOrder,
  Seller,
} from '../typings/events'
import { customDimensions } from './customDimensions'
import { getListAttributions } from './listAttribution'
import { getSelectedStoreId } from './sessionStore'

const ga4ItemFieldNames = [
  'item_store',
  'in_stock',
  'item_list_id',
  'item_list_name',
  'index',
  'item_category4',
] as const

export function getGA4ItemFields(
  ...items: Array<GA4ItemData | undefined>
) {
  const fields = items.reduce(
    (result, item) =>
      ga4ItemFieldNames.reduce(
        (itemFields, fieldName) =>
          item?.[fieldName] === undefined
            ? itemFields
            : { ...itemFields, [fieldName]: item[fieldName] },
        result
      ),
    { item_category4: '' } as GA4ItemData
  )

  const selectedStoreId = getSelectedStoreId()

  return selectedStoreId ? { ...fields, item_store: selectedStoreId } : fields
}

export function getReviewFields(item: GA4ItemData) {
  if (!item) return {}

  return {
    ...(item.reviews_number !== undefined
      ? { reviews_number: item.reviews_number }
      : {}),
    ...(item.reviews_avg !== undefined
      ? { reviews_avg: item.reviews_avg }
      : {}),
  }
}

export function getSeller(sellers: Seller[]) {
  const selectedStoreId = getSelectedStoreId()

  return (
    (selectedStoreId
      ? sellers.find(seller => seller.sellerId === selectedStoreId)
      : undefined) ??
    sellers.find(seller => seller.sellerDefault) ??
    sellers[0]
  )
}

export function getSellerItemFields(seller?: Seller) {
  if (!seller) return {}

  const availableQuantity =
    seller.commertialOffer?.AvailableQuantity ??
    seller.commercialOffer?.AvailableQuantity

  return {
    ...(availableQuantity !== undefined
      ? { in_stock: availableQuantity > 0 }
      : {}),
  }
}

export function getPrice(seller: Seller) {
  let price

  try {
    price = seller.commertialOffer.Price
  } catch {
    price = undefined
  }

  return price
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

export function getQuantity(seller: Seller) {
  const isAvailable = seller.commertialOffer.AvailableQuantity > 0

  return isAvailable ? 1 : 0
}

export function getImpressions(
  impressions: Impression[],
  itemListId?: string,
  itemListName?: string
) {
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
      ...getGA4ItemFields(categoriesHierarchy, product, sku),
      ...getSellerItemFields(seller),
      ...(itemListName ? { item_list_name: itemListName } : {}),
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

export function getDiscount(seller: Seller) {
  if (!seller.commertialOffer.PriceWithoutDiscount) return 0

  const { commertialOffer } = seller
  const { Price, PriceWithoutDiscount } = commertialOffer

  if (PriceWithoutDiscount <= Price) return 0

  let price

  try {
    price = PriceWithoutDiscount - Price
  } catch {
    price = 0
  }

  return price
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
  const categoriesHierarchy = getCategoriesWithHierarchy([
    categoryTree.join('/'),
  ])

  const item = {
    item_id: id,
    item_name: productName,
    item_brand: brand,
    item_variant: sku,
    price,
    quantity,
    ...categoriesHierarchy,
    ...getGA4ItemFields(categoriesHierarchy, product),
    ...customDimensions({
      productReference: productRefId,
      skuReference: skuRefId,
      skuName,
      quantity,
    }),
  }

  return item
}

export function formatCartItemsAndValue(
  cartItems: CartItem[],
  options?: {
    dividePrice?: boolean
    useListAttribution?: boolean
  }
) {
  let totalValue = 0.0

  if (!cartItems.length) return { items: [], totalValue }

  const storedAttributions = options?.useListAttribution
    ? getListAttributions(cartItems.map(item => item.productId))
    : {}

  const items = cartItems.map((item: CartItem) => {
    const productName = getProductNameWithoutVariant(item.name, item.skuName)

    const usesSellingPrice = item.sellingPrice !== undefined
    const shouldFormatPrice =
      item.priceIsInt ?? options?.dividePrice ?? usesSellingPrice
    const rawPrice = usesSellingPrice ? item.sellingPrice : item.price
    const formattedPrice = shouldFormatPrice ? rawPrice / 100 : rawPrice

    const itemBrand = item.brand ? item.brand : item.additionalInfo?.brandName

    const formattedCategories = getCategoriesWithHierarchy(
      item.categories?.length ? item.categories : [item.category]
    )
    const rawOriginalPrice =
      item.originalPrice ?? (usesSellingPrice ? item.price : undefined)
    const originalPrice =
      rawOriginalPrice !== undefined
        ? shouldFormatPrice
          ? rawOriginalPrice / 100
          : rawOriginalPrice
        : undefined
    const discount =
      item.discount !== undefined
        ? Math.max(
            0,
            shouldFormatPrice ? item.discount / 100 : item.discount
          )
        : originalPrice !== undefined
        ? Math.max(0, originalPrice - formattedPrice)
        : undefined
    const roundedDiscount =
      discount !== undefined ? Math.round(discount * 100) / 100 : undefined
    const storedAttribution = storedAttributions[item.productId]
    const listFields = {
      ...(storedAttribution?.listId
        ? { item_list_id: storedAttribution.listId }
        : {}),
      ...(storedAttribution?.listName
        ? { item_list_name: storedAttribution.listName }
        : {}),
      ...(storedAttribution?.position !== undefined
        ? { index: storedAttribution.position }
        : {}),
    }

    totalValue += formattedPrice * item.quantity

    return {
      item_id: item.productId,
      item_brand: itemBrand,
      item_name: productName,
      item_variant: item.skuId,
      quantity: item.quantity,
      price: formattedPrice,
      ...(roundedDiscount !== undefined ? { discount: roundedDiscount } : {}),
      ...formattedCategories,
      ...listFields,
      ...getGA4ItemFields(formattedCategories, item),
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
