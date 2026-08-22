export const parseStreamData = <T>(data: string | null): T | string => {
	if (!data) return '';

	try {
		return JSON.parse(data) as T;
	} catch {
		return data;
	}
};

export const buildChunkImageUrl = (serverUrl: string, attachmentId: number, filename: string) =>
	`${serverUrl}/api/images/${attachmentId}/${encodeURIComponent(filename)}`;

export const isInlineMeasurementPointSeparator = (textBefore: string, textAfter: string) =>
	/\b[A-Z]{1,4}\d{1,4}\s*$/.test(textBefore) &&
	/^[A-Z]{1,4}\d*[+-]\)/.test(textAfter.trimStart());

export const appendStreamingChunk = (currentText: string, chunkText: string) => {
	const checklistMarker = chunkText.match(/^[ \t]*[-*](?:[ \t]+|$)/);
	const startsChecklistItem = checklistMarker !== null;
	const markerEnd = checklistMarker?.[0].length ?? 0;
	const nextCharacter = chunkText.slice(markerEnd).trimStart()[0] ?? '';
	const continuesNumericRange = /\d\s*$/.test(currentText) && /^\d/.test(nextCharacter);
	const continuesMeasurementPoint = isInlineMeasurementPointSeparator(
		currentText,
		chunkText.slice(markerEnd),
	);
	if (
		!startsChecklistItem ||
		continuesNumericRange ||
		continuesMeasurementPoint ||
		!currentText ||
		currentText.endsWith('\n')
	) {
		return currentText + chunkText;
	}

	const directives = Array.from(
		currentText.matchAll(/::(checklist|warning|next)(?![a-ząćęłńóśźż0-9_])/gi),
	);
	const activeDirective = directives.at(-1)?.[1].toLowerCase();

	return activeDirective === 'checklist'
		? `${currentText}\n${chunkText.trimStart()}`
		: currentText + chunkText;
};

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
