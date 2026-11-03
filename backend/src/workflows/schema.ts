type Schema = Record<string, unknown>
const text = (maxLength = 4000, minLength = 0): Schema => ({ type: 'string', minLength, maxLength })
const id = { ...text(120, 1), pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' }
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values })
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const list = (items: Schema, maxItems = 200, minItems = 0): Schema => ({ type: 'array', items, minItems, maxItems })
const role = choice('trigger', 'transform', 'decision', 'action')
const edge = object({ id, source: id, target: id, label: text(200) }, ['id', 'source', 'target'])
const field = object({ name: text(200, 1), description: text() })
const webhookProperties = {
  id, name: text(200, 1), direction: choice('incoming', 'outgoing'), method: choice('POST'),
  event: text(200, 1), purpose: text(), suggestionReason: text(),
  endpoint: object({ kind: choice('managed', 'external'), urlTemplate: text(2048, 1) }),
  authentication: object({
    type: choice('signature', 'secret-header', 'slack-webhook'),
    headerName: { ...text(100, 1), pattern: '^[A-Za-z0-9-]+$' },
    secretRef: id,
  }),
  payloadTemplate: { type: 'object', maxProperties: 100, propertyNames: id, additionalProperties: text() },
}
const webhook = object({ ...webhookProperties, suggestedBy: choice('muse'), configuredBy: choice('muse'), connectionId: id, availability: choice('connection-needed', 'credential-needed', 'receiver-needed'), setup: object({ endpointReviewed: { type: 'boolean' }, authenticationReviewed: { type: 'boolean' }, payloadReviewed: { type: 'boolean' } }) }, Object.keys(webhookProperties))
export const draftSchema = object({
  prompt: text(4000),
  diagram: object({
    id, title: text(200, 1), summary: text(),
    nodes: list(object({
      id, label: text(200, 1), role, description: text(), app: text(200), reviewNote: text(),
      position: object({ x: { type: 'number', minimum: -100000, maximum: 100000 }, y: { type: 'number', minimum: -100000, maximum: 100000 } }),
    }, ['id', 'label', 'role', 'description', 'position']), 100, 1),
    edges: list(edge),
  }),
  plan: object({
    generatedBy: choice('muse'), configurationMode: choice('automatic'), structureReviewed: { type: 'boolean' },
    id, sourceDiagramId: id, title: { ...text(200, 1), pattern: '\\S' }, summary: text(), expectedOutcome: text(),
    steps: list(object({
      id, title: { ...text(200, 1), pattern: '\\S' }, role, description: text(), operation: text(200, 1), webhookTemplateId: id, reviewed: { type: 'boolean' }, configuredBy: choice('muse'),
      inputs: list(field, 100), outputs: list(field, 100),
      configuration: list(object({ label: text(200, 1), value: text(), needsInput: { type: 'boolean' } }, ['label', 'value']), 100),
      mappings: list(object({ source: text(200, 1), target: text(200, 1) }), 100),
    }, ['id', 'title', 'role', 'description', 'operation', 'inputs', 'outputs', 'configuration', 'mappings']), 100, 1),
    edges: list(edge), webhooks: list(webhook, 100),
    questions: list(object({ id, stepId: id, question: text(), explanation: text(), answer: text() }, ['id', 'stepId', 'question', 'explanation'])),
    checks: list(object({ id, title: text(200, 1), description: text(), status: choice('pending', 'needs-input', 'not-run', 'reviewed', 'configured') })),
  }, ['id', 'sourceDiagramId', 'title', 'summary', 'expectedOutcome', 'steps', 'edges', 'webhooks', 'questions', 'checks']),
})
export const diagramSchema = (draftSchema.properties as Record<string, Schema>).diagram
export const planSchema = (draftSchema.properties as Record<string, Schema>).plan
export const workflowParamsSchema = object({ id: { type: 'string', format: 'uuid' } })
export const updateSchema = object({ expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646 }, draft: draftSchema })
export const listQuerySchema = object({})
