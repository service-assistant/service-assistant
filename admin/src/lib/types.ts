export interface Category {
	id: number
	name: string
	image_url: string | null
	parent_id: number | null
	created_at: string
	updated_at: string
}

export interface CategoryTree extends Category {
	children: CategoryTree[]
}

export interface Device {
	id: number
	name: string
	model_serial_code: string | null
	image_url: string | null
	category_id: number | null
	created_at: string
	updated_at: string
}

export type IngestionStatus = 'ready' | 'queued' | 'running' | 'succeeded' | 'failed'

export interface Attachment {
	id: number
	file_global_path: string
	original_filename: string
	created_at: string
	updated_at: string

	ingest_status: IngestionStatus
	ingest_job_id: number | null
	ingest_pages_total: number
	ingest_pages_done: number
	ingest_chunks_indexed: number
	ingest_last_event: string | null
	ingest_error: string | null
	ingest_queued_at: string | null
	ingest_started_at: string | null
	ingest_finished_at: string | null
	ingest_updated_at: string | null
}

export interface User {
	id: number
	organization_id: number
	organization_slug: string
	username: string
	app_role: string
	org_role: string
	created_at: string
	updated_at: string
}
