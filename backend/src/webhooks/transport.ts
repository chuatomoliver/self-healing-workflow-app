import { request as requestHttps } from 'node:https'
import { request as requestHttp } from 'node:http'
import type { PinnedDestination } from './destination.ts'

export type SendWebhook = (destination: PinnedDestination, body: string, headers: Record<string, string>, signal: AbortSignal) => Promise<number>
export const sendWebhook: SendWebhook = (destination, body, headers, signal) => new Promise((resolve, reject) => {
  const send = destination.url.protocol === 'https:' ? requestHttps : requestHttp
  // The URL hostname remains intact for Host/SNI and certificate verification.
  // Lookup returns only the address already checked by the destination policy.
  const request = send(destination.url, {
    method: 'POST', agent: false, signal, headers, family: destination.family,
    lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
    maxHeaderSize: 16384,
  }, (response) => {
    const status = response.statusCode ?? 0
    response.destroy() // Do not persist, display, or follow receiver content/redirects.
    resolve(status)
  })
  request.on('error', reject)
  request.end(body)
})
