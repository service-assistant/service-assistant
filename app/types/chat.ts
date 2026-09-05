export const MAX_CHAT_PHOTOS = 5;

export interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
	attachedPhotoUris?: string[];
	isSpeaking?: boolean;
	hasContinuation?: boolean;
}

export interface AvailableFile {
	id: number;
	name: string;
	icon: string;
	color: string;
	remoteUrl: string;
}

export type ChatMode = 'standard' | 'diagnostic' | 'agent';
