export const parseStreamData = <T>(data: string | null): T | string => {
	if (!data) return '';

	try {
		return JSON.parse(data) as T;
	} catch {
		return data;
	}
};

export const buildChunkImageUrl = (serverUrl: string, imagePath: string) =>
	`${serverUrl}/api/images/${encodeURIComponent(imagePath)}`;

export const formatStreamingText = (text: string) => {
	let result = '';
	let cursor = 0;
	let lastListNumber: number | null = null;
	const markerPattern = /\d+[\.)]\s+/g;
	let match: RegExpExecArray | null;

	while ((match = markerPattern.exec(text)) !== null) {
		const markerStart = match.index;
		const markerNumber = Number.parseInt(match[0], 10);
		const previousChar = markerStart > 0 ? text[markerStart - 1] : '';
		const textSinceCursor = text.slice(cursor, markerStart);
		const canStartList =
			lastListNumber === null &&
			!/\d/.test(previousChar) &&
			textSinceCursor.trimEnd().endsWith(':');
		const canContinueList =
			lastListNumber !== null &&
			!/\d/.test(previousChar) &&
			markerNumber === lastListNumber + 1;

		if (!canStartList && !canContinueList) {
			continue;
		}

		result += textSinceCursor.trimEnd();
		if (!result.endsWith('\n')) {
			result += '\n';
		}
		cursor = markerStart;
		lastListNumber = markerNumber;
	}

	return result + text.slice(cursor);
};
