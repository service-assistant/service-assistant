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

export interface Attachment {
	id: number
	file_global_path: string
	original_filename: string
	created_at: string
	updated_at: string
}
