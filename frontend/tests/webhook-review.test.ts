import assert from 'node:assert/strict'
import test from 'node:test'
import { canConnectWebhookDemo, webhookReviewState } from '../src/features/workflows/webhookReview.ts'
import { sampleWebhooks } from '../src/features/workflows/data/sampleWebhooks.ts'

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
