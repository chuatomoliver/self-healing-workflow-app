import assert from 'node:assert/strict'
import test from 'node:test'
import { draftFixture } from '../../backend/tests/fixtures.ts'
import { connectWebhook } from '../src/features/workflows/connectionSetup.ts'
import type { WebhookConnection } from '../../shared/connections.ts'
import { STORED_WEBHOOK_HEADER } from '../../shared/connections.ts'
import { webhookMappingsIssue, webhookSetupIssues } from '../../shared/setup.ts'

const connection: WebhookConnection = { id: 'webhook_test', name: 'Team receiver', description: '', endpointUrl: 'https://receiver.example.test/',
  authentication: { type: 'stored-webhook', headerName: STORED_WEBHOOK_HEADER, secretRef: 'webhook_test' } }

test('any supported node count can bind a connection without rewriting business steps, edges, or payloads', () => {
  for (const count of [3, 4, 5, 6, 40]) {
    const plan = draftFixture().plan
    const transforms = Array.from({ length: count - 2 }, (_, i) => ({ ...structuredClone(plan.steps[0]), id: `transform${i}`, role: 'transform' as const, operation: 'set_fields' }))
    plan.steps.splice(1, 0, ...transforms)
    plan.edges = plan.steps.slice(1).map((step, i) => ({ id: `edge${i}`, source: plan.steps[i].id, target: step.id }))
    plan.questions = [
      { id: 'connection', stepId: 'send', question: 'Which connection should be used?', explanation: '' },
      { id: 'rule', stepId: 'send', question: 'Which account should be notified when the amount exceeds 500?', explanation: '' },
    ]
    const original = structuredClone(plan)
    const next = connectWebhook(plan, 'notify', connection)
    assert.deepEqual(plan, original)
    assert.equal(next.steps.length, count)
    assert.deepEqual(next.steps.slice(0, -1), original.steps.slice(0, -1))
    assert.deepEqual(next.edges, original.edges)
    assert.deepEqual(next.webhooks[0].payloadTemplate, original.webhooks[0].payloadTemplate)
    assert.equal(next.steps.at(-1)?.operation, 'send_webhook')
    assert.equal(webhookMappingsIssue(next.steps.at(-1)!, next.webhooks[0]), null)
    assert.deepEqual(webhookSetupIssues(next.webhooks[0]), [])
    assert.ok(next.questions[0].answer)
    assert.equal(next.questions[1].answer, undefined)
  }
})

test('Slack keeps the existing message reference and incomplete payloads still require review', () => {
  const plan = draftFixture().plan
  plan.webhooks[0].payloadTemplate = { text: '{{message.text}}' }
  const slack = { ...connection, endpointUrl: 'https://hooks.slack.com/services' }
  const next = connectWebhook(plan, 'notify', slack)
  assert.deepEqual(next.webhooks[0].payloadTemplate, { text: '{{message.text}}' })
  assert.deepEqual(next.steps[1].mappings, [{ source: 'message.text', target: 'webhook.payload.text' }])
  plan.webhooks[0].payloadTemplate = { blocks: '{{message.text}}' }
  const incomplete = connectWebhook(plan, 'notify', slack)
  assert.equal(incomplete.webhooks[0].setup?.payloadReviewed, false)
  assert.ok(webhookSetupIssues(incomplete.webhooks[0]).length)
  plan.webhooks[0].direction = 'incoming'
  assert.throws(() => connectWebhook(plan, 'notify', connection))
})
