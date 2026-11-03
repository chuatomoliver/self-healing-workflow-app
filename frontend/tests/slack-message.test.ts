import assert from 'node:assert/strict'
import test from 'node:test'
import type { SlackSetupResult } from '../../shared/slack.ts'
import { SLACK_ENDPOINT, SLACK_REFERENCE_HEADER } from '../../shared/slack.ts'
import { workflowSetupSummary } from '../../shared/setup.ts'
import { draftFixture } from '../../backend/tests/fixtures.ts'
import { configureSlackWorkflow, selectSlackConnection, setSlackMessage, slackMessageText, slackWorkflowSteps } from '../src/features/workflows/slackSetup.ts'

function slackPlan() {
  const { plan } = draftFixture()
  plan.steps = [
    { ...plan.steps[0], operation: 'manual.trigger', configuredBy: undefined },
    { id: 'message', role: 'transform', title: 'Set Message', operation: 'set_message', description: '', inputs: [], outputs: [], mappings: [],
      configuration: [{ label: 'Message text', value: 'Previous message', needsInput: true }] },
    { ...plan.steps[1], title: 'Slack: Send Message', operation: 'slack.send_message' },
  ]
  plan.edges = [{ id: 'e1', source: 'start', target: 'message' }, { id: 'e2', source: 'message', target: 'send' }]
  plan.webhooks = []
  plan.questions = [
    { id: 'connection', stepId: 'send', question: 'Which Slack account/connection should be used?', explanation: '' },
    { id: 'channel', stepId: 'send', question: 'Which Slack channel should receive the message?', explanation: '' },
    { id: 'message', stepId: 'message', question: 'What message should be sent?', explanation: '' },
  ]
  return plan
}
const connection: SlackSetupResult = { channel: '#team', connection: {
  id: 'slack-team', name: 'Team Slack', description: 'Send to #team', slackChannel: '#team', endpointUrl: SLACK_ENDPOINT,
  authentication: { type: 'slack-webhook', headerName: SLACK_REFERENCE_HEADER, secretRef: 'slack-team' },
} }

test('a message alone configures all three steps and resolves only known setup decisions', () => {
  const plan = slackPlan()
  const text = 'Hello team! 👋\nThe release is ready.'
  const edited = setSlackMessage(plan, text)
  assert.equal(slackMessageText(edited), text)
  assert.equal(slackMessageText(plan), 'Previous message')
  const configured = configureSlackWorkflow(edited, connection, text)
  assert.equal(workflowSetupSummary(configured).complete, true)
  assert.equal(configured.steps[0].reviewed, true)
  assert.equal(configured.steps[1].configuration[0].needsInput, false)
  assert.deepEqual(configured.webhooks[0].payloadTemplate, { text: '{{notification.text}}' })
  assert.equal(configured.questions.find((item) => item.id === 'message')?.answer, text)
  assert.deepEqual(configureSlackWorkflow(configured, connection, text), configured)
})

test('one saved connection is automatic, ambiguous choices and missing explicit bindings require selection', () => {
  const plan = slackPlan()
  const another = { ...connection, channel: '#another', connection: { ...connection.connection, id: 'slack-another' } }
  assert.equal(selectSlackConnection(plan, []), null)
  assert.equal(selectSlackConnection(plan, [connection]), connection)
  assert.equal(selectSlackConnection(plan, [connection, another]), null)
  const bound = configureSlackWorkflow(plan, connection, 'Hello')
  assert.equal(selectSlackConnection(bound, [another, connection]), connection)
  assert.equal(selectSlackConnection(bound, [another]), null)
})

test('empty messages remain incomplete and business rules are never answered by the automatic Slack setup', () => {
  const plan = slackPlan()
  plan.questions.push({ id: 'business', stepId: 'send', question: 'Which channel should receive messages when an order is urgent?', explanation: '' })
  plan.questions.push({ id: 'format', stepId: 'message', question: 'What message should be sent for urgent orders?', explanation: '' })
  const configured = configureSlackWorkflow(plan, connection, 'Hello')
  assert.equal(configured.questions.find((item) => item.id === 'business')?.answer, undefined)
  assert.equal(configured.questions.find((item) => item.id === 'format')?.answer, undefined)
  assert.equal(workflowSetupSummary(configured).complete, false)
  const empty = setSlackMessage(configured, '   ')
  assert.equal(empty.steps[1].reviewed, false)
  assert.equal(empty.steps[1].configuration[0].needsInput, true)
  assert.throws(() => configureSlackWorkflow(plan, connection, '   '))
})

test('automatic message setup excludes unrelated transformations and retains renamed Slack webhook steps', () => {
  const plan = slackPlan()
  plan.steps[1] = { ...plan.steps[1], title: 'Validate order', operation: 'validate_order' }
  assert.equal(slackWorkflowSteps(plan), null)
  const bound = configureSlackWorkflow(slackPlan(), connection, 'Hello')
  bound.steps[2].title = 'Notify team'
  assert.ok(slackWorkflowSteps(bound))
})

test('the simple Slack message page can reuse a connection created by general webhook setup', () => {
  const saved: SlackSetupResult = { channel: 'the channel selected in Slack', connection: {
    id: 'generic-slack', name: 'Saved Slack', description: '', endpointUrl: SLACK_ENDPOINT,
    authentication: { type: 'stored-webhook', headerName: 'X-Webhook-Reference', secretRef: 'generic-slack' },
  } }
  const next = configureSlackWorkflow(slackPlan(), saved, 'Hello team')
  assert.equal(workflowSetupSummary(next).complete, true)
  assert.equal(selectSlackConnection(next, [saved])?.connection.id, 'generic-slack')
  assert.equal(next.webhooks[0].authentication.type, 'stored-webhook')
})
