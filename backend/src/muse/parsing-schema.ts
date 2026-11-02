import { MAX_PARSE_FILE_BYTES } from '../../../shared/parsing.ts'

const text = (maxLength = 1000, minLength = 0) => ({ type: 'string', minLength, maxLength })
const id = { ...text(120, 1), pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' }
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
export const extractionSchema = object({
  title: { ...text(200, 1), pattern: '\\S' }, summary: text(4000),
  nodes: { type: 'array', maxItems: 40, items: object({
    id, label: { ...text(200, 1), pattern: '\\S' },
    role: { type: 'string', enum: ['trigger', 'transform', 'decision', 'action'] },
    description: text(), app: text(200), reviewNote: text(),
  }) },
  edges: { type: 'array', maxItems: 80, items: object({ id, source: id, target: id, label: text(200) }) },
  webhooks: { type: 'array', maxItems: 10, items: object({
    id: { ...id, maxLength: 80 }, stepId: id, name: { ...text(200, 1), pattern: '\\S' },
    direction: { type: 'string', enum: ['incoming', 'outgoing'] },
    event: { ...text(200, 1), pattern: '^[A-Za-z][A-Za-z0-9_.:-]*$', description: 'Machine-readable event identifier, for example order.created. Start with a letter; use only letters, digits, underscores, periods, colons, or hyphens. Never use spaces, slashes, or a sentence.' },
    purpose: { ...text(1000, 1), pattern: '\\S' }, suggestionReason: { ...text(1000, 1), pattern: '\\S' },
    payloadFields: { type: 'array', minItems: 1, maxItems: 20, items: object({
      name: { ...text(100, 1), pattern: '^[A-Za-z][A-Za-z0-9_]*$' },
      source: { ...text(200, 1), pattern: '^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*){1,8}$' },
      description: text(),
    }) },
  }) },
})
export const parseRequestSchema = object({
  prompt: text(4000),
  attachment: object({
    name: text(200, 1), mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'application/pdf'] },
    data: { ...text(4 * Math.ceil(MAX_PARSE_FILE_BYTES / 3), 1), pattern: '^[A-Za-z0-9+/]+={0,2}$' },
  }),
}, ['prompt'])
