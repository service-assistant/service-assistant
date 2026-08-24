import { pageCountLabel } from '@/lib/pluralize'
import type { Attachment, IngestionStatus } from '@/lib/types'

const ACTIVE_STATUSES: IngestionStatus[] = ['queued', 'running']

export const INGESTION_STATUS_LABELS: Record<IngestionStatus, string> = {
	ready: 'Oczekuje na przetworzenie',
	queued: 'W kolejce',
	running: 'Przetwarzanie',
	succeeded: 'Gotowy',
	failed: 'Błąd',
}

export const INGESTION_STATUS_BADGE_CLASSES: Record<IngestionStatus, string> = {
	ready: 'border border-cream/20 bg-cream/5 text-cream/60',
	queued: 'border border-sky-400/30 bg-sky-400/5 text-sky-300/80',
	running: 'border border-sky-400/40 bg-sky-400/10 text-sky-300',
	succeeded: 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
	failed: 'border border-red-400/40 bg-red-400/10 text-red-300',
}

export function isActive(status: IngestionStatus): boolean {
	return ACTIVE_STATUSES.includes(status)
}

export function canProcess(status: IngestionStatus): boolean {
	return status === 'ready'
}

export function canCancel(status: IngestionStatus): boolean {
	return isActive(status)
}

export function canRetry(status: IngestionStatus): boolean {
	return status === 'succeeded' || status === 'failed'
}

export function activeCount(attachments: Attachment[]): number {
	return attachments.filter((attachment) => isActive(attachment.ingest_status)).length
}

/** Items surfaced in the sidebar badge: work in progress and failed jobs. */
export function attentionCount(attachments: Attachment[]): number {
	return attachments.filter(
		(attachment) => isActive(attachment.ingest_status) || attachment.ingest_status === 'failed',
	).length
}

/** Attachments that have been queued at least once, newest-queued first. */
export function touchedAttachments(attachments: Attachment[]): Attachment[] {
	return attachments
		.filter((attachment) => attachment.ingest_status !== 'ready')
		.sort((a, b) => (b.ingest_queued_at ?? '').localeCompare(a.ingest_queued_at ?? ''))
}

/** Poll only while something can still change, so an idle panel makes no requests. */
export function pollIntervalMs(
	attachments: Attachment[] | undefined,
	intervalMs = 2000,
): number | false {
	if (!attachments) return false
	return attachments.some((attachment) => isActive(attachment.ingest_status)) ? intervalMs : false
}

/** Progress as a 0-100 percentage. Queued work reads as 0, finished work as 100. */
export function progressPercent(attachment: Attachment): number {
	if (attachment.ingest_status === 'succeeded') return 100
	if (attachment.ingest_pages_total <= 0) return 0
	const percent = (attachment.ingest_pages_done / attachment.ingest_pages_total) * 100
	return Math.min(100, Math.max(0, Math.round(percent)))
}

/** Short line under the filename: progress while running, outcome once done. */
export function statusDetail(attachment: Attachment): string | null {
	switch (attachment.ingest_status) {
		case 'ready':
			return null
		case 'queued':
			return 'Oczekuje w kolejce'
		case 'running':
			return attachment.ingest_pages_total > 0
				? `Strona ${attachment.ingest_pages_done} z ${attachment.ingest_pages_total}`
				: 'Otwieranie pliku…'
		case 'succeeded':
			return `Przetworzono ${pageCountLabel(attachment.ingest_pages_done)}`
		case 'failed':
			return attachment.ingest_error
	}
}
