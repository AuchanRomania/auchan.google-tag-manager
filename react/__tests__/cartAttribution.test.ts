import { CartItem } from '../typings/events'
import {
  clearListAttributions,
  consumeListAttributions,
  saveListAttributions,
} from '../modules/listAttribution'
import { formatCartItemsAndValue } from '../modules/utils'

const STORAGE_KEY = 'ga4:listAttr:v1'

beforeEach(() => {
  window.sessionStorage.clear()
  jest.restoreAllMocks()
})

const cartItem = ({
  productId: 'product-1',
  skuId: 'sku-1',
  brand: 'Auchan',
  name: 'Coffee',
  skuName: 'Standard',
  price: 20000,
  sellingPrice: 15000,
  categories: [
    '/Groceries/Drinks/Coffee/',
    '/Groceries/Drinks/',
    '/Groceries/',
  ],
  category: '',
  quantity: 2,
  productRefId: 'product-ref',
  referenceId: 'sku-ref',
  variant: 'Standard',
} as unknown) as CartItem

it('formats discounted cart items with categories and list attribution', () => {
  saveListAttributions([
    {
      productId: 'product-1',
      listId: 'category-10',
      listName: 'Coffee',
      position: 3,
    },
  ])

  expect(
    formatCartItemsAndValue([cartItem], { useListAttribution: true })
  ).toEqual({
    totalValue: 300,
    items: [
      {
        item_id: 'product-1',
        item_brand: 'Auchan',
        item_name: 'Coffee',
        item_variant: 'sku-1',
        item_category: 'Groceries',
        item_category2: 'Drinks',
        item_category3: 'Coffee',
        item_list_id: 'category-10',
        item_list_name: 'Coffee',
        index: 3,
        quantity: 2,
        price: 150,
        discount: 50,
        dimension1: 'product-ref',
        dimension2: 'sku-ref',
        dimension3: 'Standard',
        dimension4: 'available',
      },
    ],
  })

  expect(window.sessionStorage.getItem('ga4:listAttr:v1')).toBe('{}')
})

it('prefers explicit list attribution from the event payload', () => {
  saveListAttributions([
    {
      productId: 'product-1',
      listId: 'stored-list',
      listName: 'Stored',
      position: 1,
    },
  ])

  const { items } = formatCartItemsAndValue(
    [
      {
        ...cartItem,
        item_list_id: 'explicit-list',
        item_list_name: 'Explicit',
        index: 4,
      },
    ],
    { useListAttribution: true }
  )

  expect(items[0]).toMatchObject({
    item_list_id: 'explicit-list',
    item_list_name: 'Explicit',
    index: 4,
  })
})

it('keeps the first attribution until it is consumed', () => {
  saveListAttributions([
    {
      productId: 'product-1',
      listId: 'category-10',
      listName: 'Category',
      position: 3,
    },
  ])
  saveListAttributions([
    {
      productId: 'product-1',
      listId: 'search-coffee',
      listName: 'Search',
      position: 7,
    },
  ])

  expect(consumeListAttributions(['product-1'])).toMatchObject({
    'product-1': {
      listId: 'category-10',
      listName: 'Category',
      position: 3,
    },
  })
  expect(consumeListAttributions(['product-1'])).toEqual({})
})

it('caps the store at 100 products', () => {
  const now = 1_000_000

  jest.spyOn(Date, 'now').mockReturnValue(now)
  saveListAttributions(
    Array.from({ length: 101 }, (_, index) => ({
      productId: `product-${index}`,
      listName: 'Shelf',
      position: index,
    }))
  )

  expect(
    Object.keys(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}'))
  ).toHaveLength(100)
})

it('drops expired entries', () => {
  const now = 1_000_000
  const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now)

  saveListAttributions([
    {
      productId: 'product-1',
      listName: 'Shelf',
      position: 1,
    },
  ])

  dateNow.mockReturnValue(now + 60 * 60 * 1000 + 1)
  expect(consumeListAttributions(['product-1'])).toEqual({})
  expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('{}')
})

it('clears list attribution on consent withdrawal', () => {
  saveListAttributions([{ productId: 'product-1', listName: 'Shelf' }])

  clearListAttributions()

  expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

it('fails open when sessionStorage is unavailable', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })

  expect(() =>
    saveListAttributions([{ productId: 'product-1', listName: 'Shelf' }])
  ).not.toThrow()
})

it('fails open when sessionStorage cannot be read', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })

  expect(consumeListAttributions(['product-1'])).toEqual({})
})
