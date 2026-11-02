import { createWindowsCredentialStore } from '../muse/credential-store.ts'

export function validCredentialReference(reference: string) { return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(reference) }
export async function loadWebhookSecret(reference: string, env: NodeJS.ProcessEnv = process.env) {
  if (!validCredentialReference(reference)) return undefined
  return env[`WEBHOOK_SECRET_${reference}`] || await createWindowsCredentialStore(`Metaflow/Webhook/${reference}`).read()
}
