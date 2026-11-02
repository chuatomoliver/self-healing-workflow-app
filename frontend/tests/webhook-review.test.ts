import assert from 'node:assert/strict'
import test from 'node:test'
import { canConnectWebhookDemo, webhookReviewState } from '../src/features/workflows/webhookReview.ts'
import { sampleWebhooks } from '../src/features/workflows/data/sampleWebhooks.ts'
import { webhookAddressIssue, webhookEndpointIssue, webhookSetupIssues } from '../../shared/setup.ts'

test('Muse suggestions require setup even if a stale sample connection state has the same ID', () => {
  const suggestion = { ...sampleWebhooks[0], suggestedBy: 'muse' as const }
  assert.equal(canConnectWebhookDemo(suggestion), false)
  assert.equal(webhookReviewState(suggestion, undefined), 'needs-setup')
  assert.equal(webhookReviewState(suggestion, 'connected-demo'), 'needs-setup')
  const reopened = JSON.parse(JSON.stringify(suggestion))
  assert.equal(canConnectWebhookDemo(reopened), false)
  assert.equal(webhookReviewState(reopened, 'connected-demo'), 'needs-setup')
})

test('existing sample templates retain sample connection behavior', () => {
  assert.equal(canConnectWebhookDemo(sampleWebhooks[0]), true)
  assert.equal(webhookReviewState(sampleWebhooks[0], undefined), 'suggested')
  assert.equal(webhookReviewState(sampleWebhooks[0], 'connected-demo'), 'connected-demo')
})

test('webhook editing and review accept local test addresses consistently without accepting unsafe HTTP', () => {
  const address = 'http://127.0.0.1:22312/receiver'
  const template = { ...sampleWebhooks[1], endpoint: { ...sampleWebhooks[1].endpoint, urlTemplate: address } }
  assert.equal(webhookAddressIssue(address), null)
  assert.equal(webhookEndpointIssue(template), null)
  for (const value of ['http://127.0.0.1/receiver', 'http://example.com/receiver', 'http://10.0.0.1:3000/receiver', 'http://127.0.0.1:3000/receiver?secret=value', 'https://user:password@example.com/receiver', 'https://example.com/receiver#fragment']) assert.ok(webhookAddressIssue(value))
  // Placeholder URLs can be saved as unfinished drafts, but cannot be marked reviewed.
  assert.equal(webhookAddressIssue(sampleWebhooks[1].endpoint.urlTemplate), null)
  assert.ok(webhookEndpointIssue(sampleWebhooks[1]))
})

test('automatic setup uses a saved connection without claiming human review and becomes unresolved after an edit', () => {
  const template = { ...sampleWebhooks[1], configuredBy: 'muse' as const, connectionId: 'sales',
    endpoint: { kind: 'external' as const, urlTemplate: 'https://receiver.example.com/events' },
    setup: { endpointReviewed: false, authenticationReviewed: false, payloadReviewed: false },
    payloadTemplate: { order_id: '{{order.id}}' },
  }
  assert.deepEqual(webhookSetupIssues(template), [])
  assert.equal(template.setup.endpointReviewed, false)
  assert.equal(webhookSetupIssues({ ...template, configuredBy: undefined, connectionId: undefined }).length, 3)
  assert.ok(webhookSetupIssues({ ...template, connectionId: undefined }).length)
})
