import push from '../modules/push'
import updateEcommerce from '../modules/updateEcommerce'

jest.mock('../modules/push', () => jest.fn())

const mockedPush = push as jest.Mock

beforeEach(() => mockedPush.mockReset())

test.each(['view_item_list', 'view_store', 'add_to_cart'])(
  'clears ecommerce data before %s',
  eventName => {
    const data = { ecommerce: { items: [] } }

    updateEcommerce(eventName, data)

    expect(mockedPush).toHaveBeenCalledTimes(2)
    expect(mockedPush).toHaveBeenNthCalledWith(1, {
      ecommerce: null,
      ecommerceV2: null,
    })
    expect(mockedPush).toHaveBeenNthCalledWith(2, {
      event: eventName,
      ...data,
    })
  }
)
