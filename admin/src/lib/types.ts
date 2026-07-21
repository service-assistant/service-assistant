export interface Brand {
	id: number
	name: string
	logo_url: string | null
	created_at: string
	updated_at: string
}

export interface DeviceType {
	id: number
	name: string
	created_at: string
	updated_at: string
}

export interface Device {
	id: number
	name: string
	model_serial_code: string | null
	image_url: string | null
	brand_id: number
	device_type_id: number
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
