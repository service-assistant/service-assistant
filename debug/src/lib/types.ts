export interface ChunkRead {
	id: number
	attachment_id: number
	content: string
	metadata: { page?: number; images?: string[] } | null
	created_at: string
	updated_at: string
}

export interface DeviceRead {
	id: number
	name: string
	model_serial_code: string | null
	image_url: string | null
	category_id: number | null
	created_at: string
	updated_at: string
}

export interface AttachmentRead {
	id: number
	original_filename: string
	[key: string]: unknown
}

export interface ChatThreadRead {
	id: number
	title: string
	device_id: number
	created_at: string
	updated_at: string
}

export interface MessageRead {
	id: number
	content: string
	sender: 'user' | 'system'
	has_continuation: boolean
	router_decision: string | null
	thread_id: number
	created_at: string
	updated_at: string
}

export interface JobRead {
	id: number
	queue_name: string
	task_name: string
	lock: string | null
	args: Record<string, unknown>
	status: string
	scheduled_at: string | null
	attempts: number
	abort_requested: boolean
}

export interface JobListRead {
	items: JobRead[]
	page: number
	total_pages: number
	total: number
}

export interface BenchmarkSource {
	filename: string
	locator: string
	page: number | null
}

export interface BenchmarkCase {
	id: string
	title: string
	category: string
	question: string
	diagnostic_mode_enabled: boolean
	expected_route: string
	canonical_fault_code: string | null
	reference_answer: string
	required_facts: string[]
	required_behaviors: string[]
	forbidden_claims: string[]
	source: BenchmarkSource
	evaluation_mode: 'llm' | 'source_image'
	minimum_source_images: number
}

export interface BenchmarkCaseListRead {
	version: string
	cases: BenchmarkCase[]
}

export type BenchmarkRunState = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface BenchmarkCaseRun {
	id: string
	case_id: string
	state: BenchmarkRunState
	created_at: string
	finished_at: string | null
	error: string | null
	result: Record<string, unknown> | null
	cancel_requested: boolean
}

export interface BenchmarkSetupStep {
	key: string
	label: string
	state: string
	message: string
	details: Record<string, unknown> | null
}

export interface BenchmarkSetupRun {
	id: string
	state: string
	created_at: string
	finished_at: string | null
	error: string | null
	result: Record<string, unknown> | null
	steps: BenchmarkSetupStep[]
}

export interface BenchmarkDocumentStatus {
	total: number
	present: number
	missing: string[]
	[key: string]: unknown
}

export interface OrganizationRead {
	id: number
	name: string
	slug: string
	created_at: string
	updated_at: string
}

export interface OrganizationCreate {
	name: string
	slug: string
	admin_username: string
	admin_password: string
}

export interface OrganizationUpdate {
	name?: string
	slug?: string
}

export interface UserRead {
	id: number
	organization_id: number
	organization_slug: string
	username: string
	app_role: string
	org_role: string
}

export interface OrganizationCreateResponse {
	organization: OrganizationRead
	admin_user: UserRead
}
