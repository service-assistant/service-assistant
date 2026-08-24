import {
	activeCount,
	attentionCount,
	canCancel,
	canProcess,
	canRetry,
	pollIntervalMs,
	progressPercent,
	statusDetail,
} from '@/lib/ingestion'
import type { Attachment, IngestionStatus } from '@/lib/types'
import { describe, expect, it } from 'vitest'

function attachment(overrides: Partial<Attachment> = {}): Attachment {
	return {
		id: 1,
		file_global_path: '/tmp/manual.pdf',
		original_filename: 'manual.pdf',
		created_at: '2026-08-17T10:00:00Z',
		updated_at: '2026-08-17T10:00:00Z',
		ingest_status: 'queued' as IngestionStatus,
		ingest_job_id: 1,
		ingest_pages_total: 0,
		ingest_pages_done: 0,
		ingest_chunks_indexed: 0,
		ingest_last_event: null,
		ingest_error: null,
		ingest_queued_at: '2026-08-17T10:00:00Z',
		ingest_started_at: null,
		ingest_finished_at: null,
		ingest_updated_at: '2026-08-17T10:00:00Z',
		...overrides,
	}
}

describe('activeCount', () => {
	it('should count only queued and running attachments', () => {
		const rows = [
			attachment({ id: 1, ingest_status: 'queued' }),
			attachment({ id: 2, ingest_status: 'running' }),
			attachment({ id: 3, ingest_status: 'succeeded' }),
			attachment({ id: 4, ingest_status: 'failed' }),
		]

		expect(activeCount(rows)).toBe(2)
	})

	it('should return zero when there are no attachments', () => {
		expect(activeCount([])).toBe(0)
	})
})

describe('attentionCount', () => {
	it('counts queued, running and failed attachments but ignores completed and ready ones', () => {
		expect(
			attentionCount([
				attachment({ id: 1, ingest_status: 'ready' }),
				attachment({ id: 2, ingest_status: 'queued' }),
				attachment({ id: 3, ingest_status: 'running' }),
				attachment({ id: 4, ingest_status: 'succeeded' }),
				attachment({ id: 5, ingest_status: 'failed' }),
			]),
		).toBe(3)
	})
})

describe('pollIntervalMs', () => {
	it('should poll while any attachment is still active', () => {
		expect(pollIntervalMs([attachment({ ingest_status: 'running' })])).toBe(2000)
		expect(pollIntervalMs([attachment({ ingest_status: 'queued' })])).toBe(2000)
	})

	it('should stop polling once every attachment has finished', () => {
		const rows = [
			attachment({ ingest_status: 'succeeded' }),
			attachment({ ingest_status: 'failed' }),
		]

		expect(pollIntervalMs(rows)).toBe(false)
	})

	it('should not poll before data has loaded or when the list is empty', () => {
		expect(pollIntervalMs(undefined)).toBe(false)
		expect(pollIntervalMs([])).toBe(false)
	})
})

describe('progressPercent', () => {
	it('should report progress as a percentage of processed pages', () => {
		expect(
			progressPercent(
				attachment({
					ingest_status: 'running',
					ingest_pages_total: 10,
					ingest_pages_done: 4,
				}),
			),
		).toBe(40)
	})

	it('should report zero when the page count is not known yet', () => {
		expect(progressPercent(attachment({ ingest_status: 'running' }))).toBe(0)
	})

	it('should report a finished ingestion as complete', () => {
		expect(progressPercent(attachment({ ingest_status: 'succeeded' }))).toBe(100)
	})

	it('should clamp to 100 when more pages are reported than expected', () => {
		expect(
			progressPercent(
				attachment({
					ingest_status: 'running',
					ingest_pages_total: 2,
					ingest_pages_done: 5,
				}),
			),
		).toBe(100)
	})
})

describe('canProcess / canCancel / canRetry', () => {
	it('should allow processing only a ready attachment', () => {
		expect(canProcess('ready')).toBe(true)
		expect(canProcess('queued')).toBe(false)
		expect(canProcess('succeeded')).toBe(false)
	})

	it('should allow cancelling only active ingestions', () => {
		expect(canCancel('queued')).toBe(true)
		expect(canCancel('running')).toBe(true)
		expect(canCancel('succeeded')).toBe(false)
		expect(canCancel('ready')).toBe(false)
	})

	it('should allow retrying only succeeded or failed attachments', () => {
		expect(canRetry('failed')).toBe(true)
		expect(canRetry('succeeded')).toBe(true)
		expect(canRetry('ready')).toBe(false)
		expect(canRetry('running')).toBe(false)
	})
})

describe('statusDetail', () => {
	it('should show page progress while running', () => {
		expect(
			statusDetail(
				attachment({
					ingest_status: 'running',
					ingest_pages_total: 8,
					ingest_pages_done: 3,
				}),
			),
		).toBe('Strona 3 z 8')
	})

	it('should show the error message when the ingestion failed', () => {
		expect(
			statusDetail(
				attachment({ ingest_status: 'failed', ingest_error: 'RuntimeError: boom' }),
			),
		).toBe('RuntimeError: boom')
	})

	it('should show the processed page count when it succeeded', () => {
		expect(
			statusDetail(attachment({ ingest_status: 'succeeded', ingest_pages_done: 12 })),
		).toBe('Przetworzono 12 stron')
	})

	it('should use the right Polish plural form for the page count', () => {
		expect(statusDetail(attachment({ ingest_status: 'succeeded', ingest_pages_done: 1 }))).toBe(
			'Przetworzono 1 strona',
		)
		expect(statusDetail(attachment({ ingest_status: 'succeeded', ingest_pages_done: 3 }))).toBe(
			'Przetworzono 3 strony',
		)
	})

	it('should show nothing for a ready attachment', () => {
		expect(statusDetail(attachment({ ingest_status: 'ready' }))).toBeNull()
	})
})
