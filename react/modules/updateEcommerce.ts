import push from './push'

export default function updateEcommerce(
  eventName: string,
  data: Record<string, unknown>
) {
  push(data.event ? data : { event: eventName, ...data })
}
