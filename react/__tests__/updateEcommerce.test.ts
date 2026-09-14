import push from '../modules/push'
import updateEcommerce from '../modules/updateEcommerce'

jest.mock('../modules/push', () => jest.fn())

const mockedPush = push as jest.Mock

beforeEach(() => mockedPush.mockReset())

test.each(['view_item_list', 'view_store', 'add_to_cart'])(
  'pushes %s without a separate ecommerce reset',
  eventName => {
    const data = { ecommerce: { items: [] } }

    updateEcommerce(eventName, data)

    expect(mockedPush).toHaveBeenCalledTimes(1)
    expect(mockedPush).toHaveBeenCalledWith({
      event: eventName,
      ...data,
    })
  }
)
