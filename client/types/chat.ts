export interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
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
