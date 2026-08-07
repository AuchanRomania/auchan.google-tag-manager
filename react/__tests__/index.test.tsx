import React from 'react'
import { render } from '@testing-library/react'

import productImpressionData from '../__mocks__/productImpression'
import productDetails from '../__mocks__/productDetail'
import productClick from '../__mocks__/productClick'
import { buildViewPromotionData } from '../__mocks__/viewPromotion'
import {
  setPageTypeFromRoute,
  setUserDataFromSession,
  handleEvents,
} from '../index'
import GtmContext from '../GtmContext'
import updateEcommerce from '../modules/updateEcommerce'
import { setSelectedStoreId } from '../modules/sessionStore'
import {
  Promotion,
  PromotionClickData,
  AddToCartData,
  RemoveFromCartData,
  CartItem,
} from '../typings/events'
import { creditCardPaymentInfoMock } from '../__mocks__/addPaymentInfo'
import shouldSendGA4Events from '../modules/utils/shouldSendGA4Events'
import { beginCheckoutMock } from '../__mocks__/beginCheckout'
import { shippingInfoMock } from '../__mocks__/addShippingInfo'
import {
  viewCartWithItemsMock,
  viewCartWithNoItemsMock,
} from '../__mocks__/viewCart'
import { transaction, refundTransaction } from '../__mocks__/transaction'
import productWishlist from '../__mocks__/addToWishlist'

jest.mock('../modules/utils/shouldSendGA4Events')

jest.mock('../modules/updateEcommerce', () => jest.fn())

const mockedUpdate = updateEcommerce as jest.Mock

beforeEach(() => {
  mockedUpdate.mockReset()
  setSelectedStoreId(undefined)
  sessionStorage.clear()
  window.dataLayer = [
    { pagetype: 'home', userData: { loggedStatus: 'guest' } },
  ]
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
  }) as jest.Mock
})

test('initializes pagetype and guest userData when the block is mounted', () => {
  window.dataLayer = [{ existing: true }]

  render(<GtmContext />)

  expect(window.dataLayer[0]).toEqual({
    existing: true,
    pagetype: 'home',
    userData: { loggedStatus: 'guest' },
  })
})

test('does not block events while dataLayer context is initializing', () => {
  window.dataLayer = []
  const message = new MessageEvent('message', {
    data: productImpressionData,
  })

  handleEvents(message)
  expect(mockedUpdate).toHaveBeenCalled()
})

test.each([
  ['store.home', 'home'],
  ['store.search#category', 'category'],
  ['store.search.product-comparison#subcategory', 'category'],
  ['store.search.product-comparison#brand', 'category'],
  ['store.product', 'product'],
  ['store.product.product-comparison', 'product'],
  ['store.search', 'search'],
  ['store.search.product-comparison', 'search'],
  ['store.cart', 'cart'],
  ['store.checkout', 'checkout'],
  ['store.orderplaced', 'order_placed'],
])('emits pagetype for route %s', (routeId, pagetype) => {
  window.dataLayer = [{ existing: true }]

  setPageTypeFromRoute(routeId)

  expect(window.dataLayer[0]).toEqual({ existing: true, pagetype })
})

test('emits guest userData in dataLayer[0]', () => {
  window.dataLayer = [{ pagetype: 'home' }]

  setUserDataFromSession({
    namespaces: {
      profile: { isAuthenticated: { value: 'false' } },
    },
  })

  expect(window.dataLayer[0]).toEqual({
    pagetype: 'home',
    userData: { loggedStatus: 'guest' },
  })
})

test('emits logged user identity without exposing the raw email', async () => {
  window.dataLayer = [{ pagetype: 'product' }]
  const digest = jest
    .fn()
    .mockResolvedValue(new Uint8Array([0xab, 0xcd]).buffer)

  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { subtle: { digest } },
  })
  Object.defineProperty(global, 'TextEncoder', {
    configurable: true,
    value: class {
      public encode(value: string) {
        return Uint8Array.from(value.split('').map(char => char.charCodeAt(0)))
      }
    },
  })

  const userDataReady = setUserDataFromSession({
    namespaces: {
      profile: {
        isAuthenticated: { value: 'true' },
        id: { value: 'user-123' },
        email: { value: ' User@Example.com ' },
      },
    },
  })

  expect(window.dataLayer[0]).toEqual({
    pagetype: 'product',
    userData: {
      loggedStatus: 'logged',
      userId: 'user-123',
    },
  })

  await userDataReady

  expect(window.dataLayer[0]).toEqual({
    pagetype: 'product',
    userData: {
      loggedStatus: 'logged',
      userId: 'user-123',
      emailHash: 'abcd',
    },
  })
  expect(
    String.fromCharCode(...new Uint8Array(digest.mock.calls[0][1]))
  ).toBe('user@example.com')
  expect(JSON.stringify(window.dataLayer)).not.toContain('User@Example.com')
})

test('productImpression', () => {
  const message = new MessageEvent('message', {
    data: productImpressionData,
  })

  handleEvents(message)

  expect(mockedUpdate).toHaveBeenCalledWith('productImpression', {
    event: 'productImpression',
    ecommerce: {
      currencyCode: 'USD',
      impressions: [
        {
          brand: 'Mizuno',
          category: 'Apparel & Accessories/Shoes',
          id: '16',
          variant: '35',
          list: 'Shelf',
          name: 'Classic Shoes Top',
          position: 1,
          price: '38.9',
          dimension1: '12531',
          dimension2: '232344',
          dimension3: 'Classic Pink',
        },
        {
          brand: 'Nintendo',
          category: 'Apparel & Accessories/Watches',
          id: '15',
          variant: '32',
          list: 'Shelf',
          name: 'Gorgeous Top Watch',
          position: 2,
          price: '2200',
          dimension1: '',
          dimension2: '',
          dimension3: 'Grey',
        },
      ],
    },
  })
})

test('productDetail', async () => {
  const message = new MessageEvent('message', {
    data: productDetails,
  })

  await handleEvents(message)

  expect(updateEcommerce).toHaveBeenCalledWith('productDetail', {
    event: 'productDetail',
    ecommerce: {
      detail: {
        actionField: {
          list: 'List of products',
        },
        products: [
          {
            brand: 'Mizuno',
            category: 'Apparel & Accessories/Shoes',
            id: '16',
            variant: '35',
            name: 'Classic Shoes Top',
            price: 1540.99,
            dimension1: '123',
            dimension2: '12531',
            dimension3: 'Classic Pink',
            dimension4: 'available',
          },
        ],
      },
    },
  })
})

test('productClick', () => {
  const message = new MessageEvent('message', {
    data: productClick,
  })

  handleEvents(message)

  expect(mockedUpdate).toHaveBeenCalledWith('productClick', {
    event: 'productClick',
    ecommerce: {
      click: {
        actionField: {
          list: 'List of products',
        },
        products: [
          {
            brand: 'Mizuno',
            category: 'Apparel & Accessories/Shoes',
            id: '16',
            variant: '35',
            name: 'Classic Shoes Top',
            position: 3,
            price: 38.9,
            dimension1: '12531',
            dimension2: '',
            dimension3: 'Classic Pink',
          },
        ],
      },
    },
  })
})

describe('GA4 events', () => {
  const sendGA4Events = true
  const mockedShouldSendGA4Events = shouldSendGA4Events as jest.Mock

  beforeEach(() => {
    mockedShouldSendGA4Events.mockReset()
    mockedShouldSendGA4Events.mockReturnValue(sendGA4Events)
  })

  describe('view_item_list', () => {
    it('sends an event that signifies that some content was shown to the user', () => {
      const message = new MessageEvent('message', {
        data: productImpressionData,
      })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('view_item_list', {
        ecommerce: {
          item_list_name: 'Shelf',
          item_list_id: 'shelf-home',
          items: [
            {
              discount: 0,
              index: 1,
              item_brand: 'Mizuno',
              item_category: 'Apparel & Accessories',
              item_category2: 'Shoes',
              item_id: '16',
              item_name: 'Classic Shoes Top',
              item_variant: '35',
              item_store: '1',
              in_stock: true,
              item_list_id: 'shelf-home',
              price: 38.9,
              quantity: 1,
              dimension1: '12531',
              dimension2: '232344',
              dimension3: 'Classic Pink',
              dimension4: 'available',
            },
            {
              discount: 0,
              index: 2,
              item_brand: 'Nintendo',
              item_category: 'Apparel & Accessories',
              item_category2: 'Watches',
              item_id: '15',
              item_name: 'Gorgeous Top Watch',
              item_variant: '32',
              item_store: '1',
              in_stock: false,
              item_list_id: 'shelf-home',
              price: 2200,
              quantity: 0,
              dimension1: '',
              dimension2: '',
              dimension3: 'Grey',
              dimension4: 'unavailable',
            },
          ],
        },
      })
    })

    it('derives item_list_id from list name when pixel omits it', () => {
      const { item_list_id: _omit, ...withoutListId } = productImpressionData
      const message = new MessageEvent('message', {
        data: { ...withoutListId, list: 'Home Recommended' },
      })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith(
        'view_item_list',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            item_list_name: 'Home Recommended',
            item_list_id: 'home-recommended',
          }),
        })
      )
    })
  })

  describe('view_item', () => {
    it('sends an event that signifies that some content was shown to the user', async () => {
      const message = new MessageEvent('message', { data: productDetails })

      await handleEvents(message)

      expect(global.fetch).not.toHaveBeenCalled()
      expect(mockedUpdate).toHaveBeenCalledWith('view_item', {
        ecommerce: {
          currency: 'USD',
          value: 1540.99,
          items: [
            {
              item_id: '16',
              item_name: 'Classic Shoes Top',
              item_list_name: 'List of products',
              item_brand: 'Mizuno',
              item_variant: '35',
              price: 1540.99,
              quantity: 1,
              discount: 0,
              item_category: 'Apparel & Accessories',
              item_category2: 'Shoes',
              item_category4: 'Running',
              item_store: '1',
              reviews_number: 24,
              reviews_avg: 4.5,
              in_stock: true,
              item_list_id: 'category-10',
              dimension1: '123',
              dimension2: '12531',
              dimension3: 'Classic Pink',
              dimension4: 'available',
            },
          ],
        },
      })
    })

    it('enriches view_item with session store, fetched reviews and categoryTree depth', async () => {
      setSelectedStoreId('pickup-store-42')
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            averageRatingByProductId: {
              average: 4.2,
              total: 11,
            },
          },
        }),
      })

      const data = {
        ...productDetails,
        product: {
          ...productDetails.product,
          reviews_number: undefined,
          reviews_avg: undefined,
          categoryTree: [
            { id: '1', name: 'Bauturi si Tutun' },
            { id: '2', name: 'Apa' },
            { id: '3', name: 'Apa plata' },
            { id: '4', name: 'Apa de izvor' },
          ],
          selectedSku: {
            ...productDetails.product.selectedSku,
            item_store: undefined,
            item_category4: undefined,
            in_stock: undefined,
            sellers: [
              {
                ...productDetails.product.selectedSku.sellers[0],
                sellerId: 'pickup-store-42',
                sellerDefault: true,
              },
            ],
          },
        },
        item_list_id: undefined,
      }

      await handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith(
        'view_item',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            items: [
              expect.objectContaining({
                item_store: 'pickup-store-42',
                in_stock: true,
                reviews_number: 11,
                reviews_avg: 4.2,
                item_category: 'Bauturi si Tutun',
                item_category2: 'Apa',
                item_category3: 'Apa plata',
                item_category4: 'Apa de izvor',
              }),
            ],
          }),
        })
      )
    })

    it('uses price and stock from the selected store seller', async () => {
      setSelectedStoreId('rouqaauchanbrasovcoresi18')

      const data = {
        ...productDetails,
        product: {
          ...productDetails.product,
          selectedSku: {
            ...productDetails.product.selectedSku,
            item_store: undefined,
            in_stock: undefined,
            sellers: [
              {
                ...productDetails.product.selectedSku.sellers[0],
                sellerId: '1',
                sellerDefault: true,
                commertialOffer: {
                  ...productDetails.product.selectedSku.sellers[0]
                    .commertialOffer,
                  Price: 0,
                  AvailableQuantity: 0,
                },
              },
              {
                ...productDetails.product.selectedSku.sellers[0],
                sellerId: 'rouqaauchanbrasovcoresi18',
                sellerDefault: false,
                sellerName: 'Auchan Brasov',
                commertialOffer: {
                  ...productDetails.product.selectedSku.sellers[0]
                    .commertialOffer,
                  Price: 3.99,
                  AvailableQuantity: 8,
                },
              },
            ],
          },
        },
      }

      await handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith(
        'view_item',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            currency: 'USD',
            value: 3.99,
            items: [
              expect.objectContaining({
                item_store: 'rouqaauchanbrasovcoresi18',
                in_stock: true,
                price: 3.99,
                quantity: 1,
                dimension4: 'available',
              }),
            ],
          }),
        })
      )
    })

    it('uses priced seller as item_store when session store seller is missing on SKU', async () => {
      setSelectedStoreId('rouqaauchanbrasovcoresi18')

      const data = {
        ...productDetails,
        product: {
          ...productDetails.product,
          selectedSku: {
            ...productDetails.product.selectedSku,
            item_store: undefined,
            in_stock: undefined,
            sellers: [
              {
                ...productDetails.product.selectedSku.sellers[0],
                sellerId: '1',
                sellerDefault: true,
                commertialOffer: {
                  ...productDetails.product.selectedSku.sellers[0]
                    .commertialOffer,
                  Price: 3.99,
                  AvailableQuantity: 5,
                },
              },
            ],
          },
        },
      }

      await handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith(
        'view_item',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            value: 3.99,
            items: [
              expect.objectContaining({
                item_store: '1',
                in_stock: true,
                price: 3.99,
                quantity: 1,
              }),
            ],
          }),
        })
      )
    })
  })

  describe('select_item', () => {
    it('sends an event that signifies an item was selected from a list', () => {
      const message = new MessageEvent('message', { data: productClick })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('select_item', {
        ecommerce: {
          item_list_name: 'List of products',
          item_list_id: 'category-10',
          items: [
            {
              item_id: '16',
              item_name: 'Classic Shoes Top',
              item_list_name: 'List of products',
              item_brand: 'Mizuno',
              item_variant: '35',
              item_store: '1',
              in_stock: true,
              item_list_id: 'category-10',
              index: 3,
              price: 38.9,
              quantity: 1,
              discount: 0,
              item_category: 'Apparel & Accessories',
              item_category2: 'Shoes',
              dimension1: '12531',
              dimension2: '',
              dimension3: 'Classic Pink',
              dimension4: 'available',
            },
          ],
        },
      })
    })

    it('enriches list attribution from sessionStorage when pixel omits item_list_id', () => {
      sessionStorage.setItem(
        'ga4:listAttr:v1',
        JSON.stringify({
          '16': {
            listId: 'category-bere-doza',
            listName: 'Bere doza',
            position: 5,
            ts: Date.now(),
          },
        })
      )

      const { item_list_id: _omit, ...clickWithoutListId } = productClick

      const message = new MessageEvent('message', {
        data: { ...clickWithoutListId, list: undefined, position: undefined },
      })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith(
        'select_item',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            item_list_id: 'category-bere-doza',
            item_list_name: 'Bere doza',
            items: [
              expect.objectContaining({
                item_id: '16',
                item_list_id: 'category-bere-doza',
                item_list_name: 'Bere doza',
                index: 5,
              }),
            ],
          }),
        })
      )
    })
  })

  describe('select_promotion', () => {
    it('sends an event that signifies a promotion was selected from a list', () => {
      const promotion: Promotion = {
        id: 'P_12345',
        name: 'Summer Sale',
        creative: 'Summer Banner',
        position: 'featured_app_1',
      }

      const data: PromotionClickData = {
        currency: 'USD',
        event: 'promotionClick',
        eventName: 'vtex:promotionClick',
        eventType: 'vtex:promotionClick',
        promotions: [promotion],
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('select_promotion', {
        ecommerce: {
          creative_name: 'Summer Banner',
          creative_slot: 'featured_app_1',
          promotion_id: 'P_12345',
          promotion_name: 'Summer Sale',
        },
      })
    })
  })

  describe('add_to_cart', () => {
    it('sends an event that signifies an item being added to the cart', () => {
      type CartItemMockType = Pick<
        CartItem,
        | 'name'
        | 'brand'
        | 'price'
        | 'skuId'
        | 'skuName'
        | 'quantity'
        | 'category'
        | 'productId'
        | 'productRefId'
        | 'referenceId'
        | 'variant'
        | 'item_store'
        | 'in_stock'
        | 'item_category4'
      >

      const cartItem1: CartItemMockType = {
        productId: '200000202',
        skuId: '2000304',
        brand: 'Sony',
        name: 'Top Wood',
        skuName: 'top_wood_200',
        price: 197.99,
        category: 'Home & Decor',
        quantity: 1,
        productRefId: '123',
        referenceId: '456',
        variant: 'Red',
        item_store: '1',
        in_stock: false,
        item_category4: 'Furniture',
      }

      const cartItem2: CartItemMockType = {
        productId: '200000203',
        skuId: '2000305',
        brand: 'Sony',
        name: 'Top Wood 2',
        skuName: 'top_wood_300',
        price: 150.9,
        category: 'Home & Decor/Tables',
        quantity: 2,
        productRefId: '789',
        referenceId: '101',
        variant: 'Blue',
      }

      const data: AddToCartData = {
        currency: 'USD',
        event: 'addToCart',
        eventName: 'vtex:addToCart',
        items: [cartItem1 as CartItem, cartItem2 as CartItem],
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('add_to_cart', {
        ecommerce: {
          currency: 'USD',
          value: 499.79,
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              item_category4: 'Furniture',
              item_store: '1',
              in_stock: false,
              quantity: 1,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
            {
              item_id: '200000203',
              item_brand: 'Sony',
              item_name: 'Top Wood 2',
              item_variant: '2000305',
              item_category: 'Home & Decor',
              item_category2: 'Tables',
              quantity: 2,
              price: 150.9,
              discount: 0,
              dimension1: '789',
              dimension2: '101',
              dimension3: 'Blue',
              dimension4: 'available',
            },
          ],
        },
      })
    })

    it('uses selling/list prices for discount and pixel list attribution (then consumes)', () => {
      sessionStorage.setItem(
        'ga4:listAttr:v1',
        JSON.stringify({
          'prod-1': {
            listId: 'category-bere-doza',
            listName: 'Bere doza',
            position: 2,
            ts: Date.now(),
          },
        })
      )

      const data: AddToCartData = {
        currency: 'RON',
        event: 'addToCart',
        eventName: 'vtex:addToCart',
        items: [
          {
            productId: 'prod-1',
            skuId: 'sku-1',
            brand: 'Ursus',
            name: 'Bere doza Ursus',
            skuName: '0.5 l',
            price: 350,
            sellingPrice: 350,
            listPrice: 500,
            priceIsInt: true,
            category: 'Bauturi si Tutun/Bere si cidru/Bere doza',
            quantity: 1,
            productRefId: 'ref',
            referenceId: 'sku-ref',
            variant: '0.5 l',
            item_list_id: 'category-bere-doza',
            item_list_name: 'Bere doza',
            index: 2,
          } as CartItem,
        ],
      }

      handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith(
        'add_to_cart',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            currency: 'RON',
            value: 3.5,
            items: [
              expect.objectContaining({
                item_id: 'prod-1',
                price: 3.5,
                discount: 1.5,
                item_category: 'Bauturi si Tutun',
                item_category2: 'Bere si cidru',
                item_category3: 'Bere doza',
                item_list_id: 'category-bere-doza',
                item_list_name: 'Bere doza',
                index: 2,
              }),
            ],
          }),
        })
      )

      const remaining = JSON.parse(
        sessionStorage.getItem('ga4:listAttr:v1') || '{}'
      )

      expect(remaining['prod-1']).toBeUndefined()
    })

    it('does not attach or consume list attribution without pixel list fields', () => {
      sessionStorage.setItem(
        'ga4:listAttr:v1',
        JSON.stringify({
          'prod-1': {
            listId: 'category-bere-doza',
            listName: 'Bere doza',
            position: 2,
            ts: Date.now(),
          },
        })
      )

      const data: AddToCartData = {
        currency: 'RON',
        event: 'addToCart',
        eventName: 'vtex:addToCart',
        items: [
          {
            productId: 'prod-1',
            skuId: 'sku-1',
            brand: 'Ursus',
            name: 'Bere doza Ursus',
            skuName: '0.5 l',
            price: 350,
            sellingPrice: 350,
            listPrice: 500,
            priceIsInt: true,
            category: 'Bauturi si Tutun/Bere si cidru/Bere doza',
            quantity: 1,
            productRefId: 'ref',
            referenceId: 'sku-ref',
            variant: '0.5 l',
          } as CartItem,
        ],
      }

      handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith(
        'add_to_cart',
        expect.objectContaining({
          ecommerce: expect.objectContaining({
            items: [
              expect.not.objectContaining({
                item_list_id: 'category-bere-doza',
              }),
            ],
          }),
        })
      )

      const remaining = JSON.parse(
        sessionStorage.getItem('ga4:listAttr:v1') || '{}'
      )

      expect(remaining['prod-1']).toBeDefined()
    })
  })

  describe('remove_from_cart', () => {
    it('sends an event that signifies an item being removed from cart', () => {
      type CartItemMockType = Pick<
        CartItem,
        | 'name'
        | 'brand'
        | 'price'
        | 'skuId'
        | 'skuName'
        | 'quantity'
        | 'category'
        | 'productId'
        | 'productRefId'
        | 'referenceId'
        | 'variant'
      >

      const cartItem: CartItemMockType = {
        productId: '200000202',
        skuId: '2000304',
        brand: 'Sony',
        name: 'Top Wood',
        skuName: 'top_wood_200',
        price: 197.99,
        category: 'Home & Decor',
        quantity: 3,
        productRefId: '123',
        referenceId: '456',
        variant: 'Red',
      }

      const data: RemoveFromCartData = {
        currency: 'USD',
        event: 'removeFromCart',
        eventName: 'vtex:removeFromCart',
        items: [cartItem as CartItem],
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('remove_from_cart', {
        ecommerce: {
          currency: 'USD',
          value: 593.97,
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              quantity: 3,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
          ],
        },
      })
    })
  })

  describe('purchase', () => {
    it('sends an event that signifies a successful checkout on orderPlaced page', () => {
      const data = transaction

      data.event = 'orderPlaced'
      data.eventName = 'vtex:orderPlaced'

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('purchase', {
        ecommerce: {
          coupon: null,
          currency: 'USD',
          items: [
            {
              item_brand: 'New Offers!!',
              item_category: 'Apparel & Accessories',
              item_id: '9',
              item_name: 'Top Everyday Necessaire',
              item_variant: '20',
              item_store: '1',
              price: 1600.99,
              quantity: 2,
              dimension1: '',
              dimension2: '9812983',
              dimension3: '100 RMS',
              dimension4: 'available',
            },
          ],
          shipping: 1942.61,
          tax: 0,
          transaction_id: '1310750551387',
          value: 5144.59,
        },
      })
    })
  })

  describe('view_promotion', () => {
    it('sends an event that signifies a promotion was viewed from a list', () => {
      const data = buildViewPromotionData({
        id: 'P_12345',
        name: 'Summer Sale',
        creative: 'Summer Banner',
        position: 'featured_app_1',
        products: [
          {
            productId: 'SKU_20',
            productName: 'Tea Leaves',
          },
          {
            productId: 'SKU_30',
            productName: 'Coffee Beans',
          },
        ],
      })

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('view_promotion', {
        ecommerce: {
          creative_name: 'Summer Banner',
          creative_slot: 'featured_app_1',
          promotion_id: 'P_12345',
          promotion_name: 'Summer Sale',
          items: [
            {
              item_id: 'SKU_20',
              item_name: 'Tea Leaves',
            },
            {
              item_id: 'SKU_30',
              item_name: 'Coffee Beans',
            },
          ],
        },
      })
    })
  })

  describe('add_payment_info', () => {
    it('sends an event when a user add a payment information (credit card)', () => {
      const data = creditCardPaymentInfoMock

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('add_payment_info', {
        ecommerce: {
          currency: 'USD',
          value: 211.19,
          payment_type: 'creditCard',
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              quantity: 1,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
          ],
        },
      })
    })
  })

  describe('begin_checkout', () => {
    it('sends an event when a user access the checkout page', () => {
      const data = beginCheckoutMock

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('begin_checkout', {
        ecommerce: {
          currency: 'USD',
          value: 650.69,
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              quantity: 1,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
            {
              item_id: '200000203',
              item_brand: 'Sony',
              item_name: 'Top Wood 2',
              item_variant: '2000305',
              item_category: 'Home & Decor',
              item_category2: 'Tables',
              quantity: 3,
              price: 150.9,
              discount: 0,
              dimension1: '789',
              dimension2: '101',
              dimension3: 'Blue',
              dimension4: 'available',
            },
          ],
        },
      })
    })
  })

  describe('view_cart', () => {
    it('uses category names and ignores legacy productCategoryIds maps', () => {
      const data = {
        eventName: 'vtex:viewCart',
        event: 'viewCart',
        currency: 'USD',
        items: [
          {
            productId: '1',
            skuId: '10',
            additionalInfo: { brandName: 'Auchan' },
            name: 'Apa 5l',
            skuName: 'Apa 5l',
            price: 399,
            category: 'Bauturi si Tutun/Apa/Apa plata',
            productCategories: { '25': '25', '32': '32', '40': '40' },
            productCategoryIds: '/25/32/40/',
            quantity: 1,
            productRefId: 'ref',
            referenceId: 'sku-ref',
            variant: 'Default',
          },
        ],
      }

      handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith('view_cart', {
        ecommerce: {
          currency: 'USD',
          value: 3.99,
          items: [
            expect.objectContaining({
              item_id: '1',
              item_category: 'Bauturi si Tutun',
              item_category2: 'Apa',
              item_category3: 'Apa plata',
            }),
          ],
        },
      })

      const pushedItems = mockedUpdate.mock.calls.find(
        ([eventName]) => eventName === 'view_cart'
      )?.[1]?.ecommerce?.items

      expect(pushedItems?.[0]).not.toEqual(
        expect.objectContaining({ item_category: '25' })
      )
      expect(pushedItems?.[0]).not.toHaveProperty('item_category4')
    })

    it('sends an event when a user opens the cart with items', () => {
      const data = viewCartWithItemsMock

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('view_cart', {
        ecommerce: {
          currency: 'USD',
          value: 546.88,
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              quantity: 2,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
            {
              item_id: '200000203',
              item_brand: 'Sony',
              item_name: 'Top Wood 2',
              item_variant: '2000305',
              item_category: 'Home & Decor',
              item_category2: 'Tables',
              quantity: 1,
              price: 150.9,
              discount: 0,
              dimension1: '789',
              dimension2: '101',
              dimension3: 'Blue',
              dimension4: 'available',
            },
          ],
        },
      })
    })

    it('sends an event when a user opens the cart with no items', () => {
      const data = viewCartWithNoItemsMock

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('view_cart', {
        ecommerce: {
          currency: 'USD',
          value: 0.0,
          items: [],
        },
      })
    })
  })

  describe('refund', () => {
    it('sends an event when the user refunds an order', () => {
      const data = refundTransaction

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('refund', {
        ecommerce: {
          currency: 'USD',
          items: [
            {
              item_brand: 'New Offers!!',
              item_category: 'Apparel & Accessories',
              item_id: '9',
              item_name: 'Top Everyday Necessaire',
              item_variant: '20',
              item_store: '1',
              price: 1600.99,
              quantity: 2,
              dimension1: '',
              dimension2: '9812983',
              dimension3: '100 RMS',
              dimension4: 'available',
            },
          ],
          shipping: 1942.61,
          tax: 0,
          transaction_id: '1310750551387',
          value: 3543.6,
        },
      })
    })
  })

  describe('add_shipping_info', () => {
    it('sends an event when a user add a shipping info', () => {
      const data = shippingInfoMock

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('add_shipping_info', {
        ecommerce: {
          currency: 'USD',
          value: 1958.35,
          shipping_tier: 'Ground',
          items: [
            {
              item_id: '200000202',
              item_brand: 'Sony',
              item_name: 'Top Wood',
              item_variant: '2000304',
              item_category: 'Home & Decor',
              quantity: 1,
              price: 197.99,
              discount: 0,
              dimension1: '123',
              dimension2: '456',
              dimension3: 'Red',
              dimension4: 'available',
            },
          ],
        },
      })
    })
  })

  describe('add_to_wishlist', () => {
    it('maps the wishlist payload emitted by the storefront', () => {
      const data = {
        currency: 'RON',
        eventName: 'vtex:addToWishlist',
        event: 'addToWishlist',
        wishlistEventObject: {
          action: 'add',
          button_type: 'addToWishlist - product page',
          page_type: 'product page',
          product_id: '454698',
          product_title: 'Apa minerala Dorna, 2 l',
          item_price: 114.52,
          item_quantity: 1,
          product_brand: 'Dorna',
          categories_path: 'Bauturi si Tutun > Apa > Apa carbogazoasa',
        },
      }

      handleEvents(new MessageEvent('message', { data }))

      expect(mockedUpdate).toHaveBeenCalledWith('add_to_wishlist', {
        ecommerce: {
          currency: 'RON',
          value: 114.52,
          items: [
            {
              item_id: '454698',
              item_name: 'Apa minerala Dorna, 2 l',
              item_brand: 'Dorna',
              item_category: 'Bauturi si Tutun',
              item_category2: 'Apa',
              item_category3: 'Apa carbogazoasa',
              price: 114.52,
              quantity: 1,
              discount: 0,
            },
          ],
        },
      })
    })

    it('sends an event when the user add a product to wishlist', () => {
      const message = new MessageEvent('message', { data: productWishlist })

      message.data.eventName = 'vtex:addToWishlist'

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('add_to_wishlist', {
        ecommerce: {
          currency: 'USD',
          value: 1540.99,
          items: [
            {
              item_id: '16',
              item_name: 'Classic Shoes Top',
              item_list_name: 'List of products',
              item_brand: 'Mizuno',
              item_variant: '35',
              price: 1540.99,
              quantity: 1,
              discount: 0,
              item_category: 'Apparel & Accessories',
              item_category2: 'Shoes',
              item_store: '1',
              reviews_number: 24,
              reviews_avg: 4.5,
              in_stock: true,
              item_list_id: 'category-10',
              dimension1: '123',
              dimension2: '12531',
              dimension3: 'Classic Pink',
              dimension4: 'available',
            },
          ],
        },
      })
    })
  })
  describe('login', () => {
    it('sends an event when a user login on store with any method', () => {
      const data = {
        event: 'login',
        eventName: 'vtex:login',
        method: 'Google',
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('login', {
        ecommerce: {
          method: 'Google',
        },
      })
    })
  })
  describe('search', () => {
    it('sends an event when a user search for a term on store', () => {
      const data = {
        event: 'search',
        eventName: 'vtex:search',
        term: 'Top Wood',
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('search', {
        ecommerce: {
          search_term: 'Top Wood',
        },
      })
    })
  })

  describe('sign_up', () => {
    it('sends an event when a user signup on store with any method', () => {
      const data = {
        event: 'signUp',
        eventName: 'vtex:signUp',
        method: 'Google',
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('sign_up', {
        ecommerce: {
          method: 'Google',
        },
      })
    })
  })

  describe('share', () => {
    it('sends an event when a user share a product via any type', () => {
      const data = {
        event: 'share',
        eventName: 'vtex:share',
        method: 'Facebook',
        contentType: 'image',
        itemId: '10',
      }

      const message = new MessageEvent('message', { data })

      handleEvents(message)

      expect(mockedUpdate).toHaveBeenCalledWith('share', {
        ecommerce: {
          method: 'Facebook',
          content_type: 'image',
          item_id: '10',
        },
      })
    })
  })
})
