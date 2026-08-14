export type NameplateAttribute = {
	label: string;
	value: string;
	unit?: string | null;
	confidence?: number | null;
};

export type NameplateData = {
	model: string;
	attributes: NameplateAttribute[];
	raw_text: string;
	model_confidence?: number | null;
	match_confidence?: number | null;
};

export type NameplateDeviceCandidate = {
	id: number;
	name: string;
	model_serial_code?: string | null;
	score: number;
	matched_identifier: string;
};

export type NameplateRecognition = {
	nameplate_data: NameplateData;
	matched_device?: NameplateDeviceCandidate | null;
	candidates: NameplateDeviceCandidate[];
	requires_confirmation: boolean;
};

export type ChatThreadWithNameplate = {
	id: number;
	device_id: number;
	title: string;
	nameplate_data?: NameplateData | null;
};
