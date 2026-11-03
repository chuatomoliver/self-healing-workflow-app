import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasSetupBlockers } from '../src/features/canvas/readiness.ts'
import { workflowSetupSummary } from '../../shared/setup.ts'
import { draftFixture } from '../../backend/tests/fixtures.ts'

function configuredPlan() {
  const { plan } = draftFixture()
  plan.structureReviewed = true
  plan.steps.forEach((step) => { step.configuredBy = 'muse' })
  plan.steps[1].title = 'Set Message'
  plan.steps[1].configuration = [{ label: 'Message text', value: 'Hello team!', needsInput: false }]
  plan.steps[1].mappings = [{ source: 'request.subject', target: 'webhook.payload.subject' }]
  plan.webhooks[0].endpoint.urlTemplate = 'https://receiver.example.com/events'
  plan.webhooks[0].setup = { endpointReviewed: true, authenticationReviewed: true, payloadReviewed: true }
  return plan
}

test('canvas identifies a filled message that still needs input and becomes ready only after that flag is resolved', () => {
  const plan = configuredPlan()
  plan.steps[1].configuration[0].needsInput = true
  assert.equal(workflowSetupSummary(plan).complete, false)
  assert.deepEqual(canvasSetupBlockers(plan), ['Set Message: complete Message text and clear Still needs input.'])
  plan.steps[1].configuration[0].needsInput = false
  assert.equal(workflowSetupSummary(plan).complete, true)
  assert.deepEqual(canvasSetupBlockers(plan), [])
})

test('canvas blockers agree with setup readiness for missing structure, review, mappings, credentials, and answers', () => {
  for (const mode of ['ready', 'structure', 'review', 'mapping', 'credential', 'answer', 'orphan']) {
    const plan = configuredPlan()
    if (mode === 'structure') plan.structureReviewed = false
    if (mode === 'review') delete plan.steps[0].configuredBy
    if (mode === 'mapping') plan.steps[1].mappings = []
    if (mode === 'credential') plan.webhooks[0].authentication.secretRef = ''
    if (mode === 'answer') plan.questions = [{ id: 'q', stepId: 'send', question: 'Which channel?', explanation: 'Choose a destination.' }]
    if (mode === 'orphan') delete plan.steps[1].webhookTemplateId
    assert.equal(canvasSetupBlockers(plan).length === 0, workflowSetupSummary(plan).complete, mode)
  }
})
