// Keep constrained decoding simple. The API routes still validate every response
// against the original schema, including these bounds and patterns.
const localConstraints = new Set(['pattern', 'minLength', 'maxLength', 'minItems', 'maxItems'])

export function museOutputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !localConstraints.has(key)).map(([key, value]) => {
    if (key === 'properties' && value && typeof value === 'object') {
      return [key, Object.fromEntries(Object.entries(value).map(([name, child]) => [name, museOutputSchema(child)]))]
    }
    if (key === 'items' && value && typeof value === 'object' && !Array.isArray(value)) {
      return [key, museOutputSchema(value as Record<string, unknown>)]
    }
    return [key, value]
  }))
}
