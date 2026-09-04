import { describe, expect, it } from 'vitest'
import { callSummary, isWriteAction } from '@/lib/assistant/callSummary'

describe('callSummary', () => {
  it('names the dataset a create writes', () => {
    expect(callSummary('create_dataset', { group_id: 'g-1', name: 'Water quality 2024' }))
      .toBe('Creating dataset "Water quality 2024"')
  })

  it('leaves a path unquoted and names the bucket', () => {
    expect(callSummary('write_object', { bucket: 'lab-data', key: 'results/new.csv', text: 'a' }))
      .toBe('Writing object results/new.csv in bucket lab-data')
  })

  it('reads a delete as taking something out of the bucket', () => {
    expect(callSummary('delete_object', { bucket: 'lab-data', key: 'results/old.csv' }))
      .toBe('Deleting object results/old.csv from bucket lab-data')
  })

  it('looks one level in for the name of a job spec', () => {
    expect(callSummary('submit_job', { spec: { name: 'Nightly counts', runtime: 'python' } }))
      .toBe('Submitting job "Nightly counts"')
  })

  it('keeps the subject alone when no field is worth naming', () => {
    expect(callSummary('run_script', { group_id: 'g-1', script: 'print(1)' })).toBe('Running script')
  })

  it('falls back to the tool name it does not know', () => {
    expect(callSummary('list_buckets', {})).toBe('list_buckets')
    expect(callSummary('sparql_query', { query: 'SELECT *' })).toBe('sparql_query')
  })

  it('survives an input that is not an object', () => {
    expect(callSummary('cancel_job', 'j-1')).toBe('Cancelling job')
  })

  it('treats an inherited object key as no verb', () => {
    expect(isWriteAction('constructor_thing')).toBe(false)
    expect(callSummary('constructor_thing', {})).toBe('constructor_thing')
  })

  it('marks the write tools and leaves the read tools alone', () => {
    expect(isWriteAction('create_dataset')).toBe(true)
    expect(isWriteAction('delete_entity')).toBe(true)
    expect(isWriteAction('get_dataset')).toBe(false)
    expect(isWriteAction('search')).toBe(false)
  })
})
