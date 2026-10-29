import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_DIAGRAM_BYTES, MAX_PROMPT_LENGTH, prepareIngestionDraft, validateDiagram } from '../src/features/ingestion/validation.ts'

const diagram = new File(['diagram'], 'flow.png', { type: 'image/png' })

test('requires a description or a diagram, including whitespace-only input', () => {
  assert.equal(prepareIngestionDraft('', null).ok, false)
  assert.equal(prepareIngestionDraft(' \n\t ', null).ok, false)
})

test('trims text and skips parsing when there is no diagram', () => {
  const result = prepareIngestionDraft('  Send an order summary.  ', null)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.draft.prompt, 'Send an order summary.')
    assert.equal(result.draft.nextStep, 'review-plan')
    assert.equal(result.draft.diagram, null)
  }
})

test('accepts diagram-only input and routes it to parsing', () => {
  const result = prepareIngestionDraft('', diagram)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.draft.diagram, diagram)
    assert.equal(result.draft.nextStep, 'parse-diagram')
  }
})

test('keeps both the prompt and diagram for combined input', () => {
  const result = prepareIngestionDraft('Create a deal.', diagram)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.draft.prompt, 'Create a deal.')
    assert.equal(result.draft.diagram, diagram)
    assert.equal(result.draft.nextStep, 'parse-diagram')
  }
})

test('accepts the prompt limit and rejects oversized descriptions', () => {
  assert.equal(prepareIngestionDraft('x'.repeat(MAX_PROMPT_LENGTH), null).ok, true)
  assert.equal(prepareIngestionDraft('x'.repeat(MAX_PROMPT_LENGTH + 1), null).ok, false)
})

test('accepts PNG, JPG, JPEG, and PDF with case-insensitive extensions', () => {
  for (const [name, type] of [['flow.PNG', 'image/png'], ['flow.jpg', 'image/jpeg'], ['flow.jpeg', 'image/jpeg'], ['flow.pdf', 'application/pdf']]) {
    assert.equal(validateDiagram({ name, type, size: 100 }), null)
  }
})

test('supports a missing browser MIME type when the extension is recognized', () => {
  assert.equal(validateDiagram({ name: 'flow.pdf', type: '', size: 100 }), null)
})

test('rejects unsupported extensions and mismatched MIME types', () => {
  for (const file of [
    { name: 'flow.svg', type: 'image/svg+xml', size: 100 },
    { name: 'flow.png.exe', type: '', size: 100 },
    { name: 'flow.png', type: 'application/pdf', size: 100 },
    { name: 'constructor', type: '', size: 100 },
  ]) assert.notEqual(validateDiagram(file), null)
})

test('rejects empty and oversized files but accepts the size boundary', () => {
  const file = { name: 'flow.png', type: 'image/png' }
  assert.notEqual(validateDiagram({ ...file, size: 0 }), null)
  assert.equal(validateDiagram({ ...file, size: MAX_DIAGRAM_BYTES }), null)
  assert.notEqual(validateDiagram({ ...file, size: MAX_DIAGRAM_BYTES + 1 }), null)
})

test('revalidates a diagram when preparing the eventual request payload', () => {
  const invalidFile = new File(['text'], 'flow.txt', { type: 'text/plain' })
  assert.equal(prepareIngestionDraft('Valid description.', invalidFile).ok, false)
})
