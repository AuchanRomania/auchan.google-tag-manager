import push from './push'

export default function updateEcommerce(
  eventName: string,
  data: Record<string, unknown>
) {
  push({ ecommerce: null, ecommerceV2: null })

  push(data.event ? data : { event: eventName, ...data })
}
