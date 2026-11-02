import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ApiError } from '../errors.ts'

export type DestinationPolicy = { allowedOrigins: string[]; localReceiverUrl?: string }
export type PinnedDestination = { url: URL; address: string; family: 4 | 6 }
export type ResolveAddresses = (hostname: string) => Promise<{ address: string; family: number }[]>
const blocked = () => new ApiError(400, 'WEBHOOK_DESTINATION_BLOCKED', 'Allow this destination in the backend configuration. Public HTTPS receivers are required; local testing needs an exact local-receiver URL.')

export function readDestinationPolicy(env: NodeJS.ProcessEnv = process.env): DestinationPolicy {
  const allowedOrigins = (env.WEBHOOK_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const url = new URL(item)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid WEBHOOK_ALLOWED_ORIGINS')
    return url.origin
  })
  const localReceiverUrl = env.WEBHOOK_LOCAL_RECEIVER_URL
  if (localReceiverUrl) {
    const url = new URL(localReceiverUrl)
    if (env.NODE_ENV === 'production' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash) throw new Error('Invalid WEBHOOK_LOCAL_RECEIVER_URL')
  }
  return { allowedOrigins, ...(localReceiverUrl ? { localReceiverUrl: new URL(localReceiverUrl).href } : {}) }
}
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c))))
      || (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (isIP(address) === 6) {
    const first = Number.parseInt(address.split(':')[0], 16)
    const second = Number.parseInt(address.split(':')[1] || '0', 16)
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002
      && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
      && !(first === 0x3fff && second < 0x1000)
  }
  return false
}
export async function pinDestination(value: string, policy: DestinationPolicy, resolve: ResolveAddresses = (hostname) => lookup(hostname, { all: true, verbatim: true })): Promise<PinnedDestination> {
  let url: URL
  try { url = new URL(value) } catch { throw blocked() }
  if (url.username || url.password || url.search || url.hash || /[{}]/.test(value)) throw blocked()
  if (policy.localReceiverUrl && url.href === policy.localReceiverUrl && url.protocol === 'http:' && url.hostname === '127.0.0.1') return { url, address: '127.0.0.1', family: 4 }
  if (url.protocol !== 'https:' || !policy.allowedOrigins.includes(url.origin) || url.hostname.endsWith('.invalid')) throw blocked()
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: { address: string; family: number }[]
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
      resolve(hostname), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(blocked()), 3000) }),
    ])
  } catch { throw blocked() } finally { clearTimeout(timer) }
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address) || isIP(item.address) !== item.family)) throw blocked()
  const chosen = addresses.find((item) => item.family === 4) ?? addresses[0]
  return { url, address: chosen.address, family: chosen.family as 4 | 6 }
}
