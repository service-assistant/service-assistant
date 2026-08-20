const MAX_UPLOAD_SIZE = 200 * 1024 * 1024

type UploadCandidate = Pick<File, 'name' | 'size' | 'type'>

export function fileSelectionError(files: UploadCandidate[]): string | null {
	if (
		files.some(
			(file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'),
		)
	) {
		return 'Wszystkie pliki muszą być w formacie PDF.'
	}
	if (files.some((file) => file.size > MAX_UPLOAD_SIZE)) {
		return 'Każdy plik może mieć maksymalnie 200 MB.'
	}
	return null
}

export function mergeUploadFiles(current: File[], added: File[]): File[] {
	const knownFiles = new Set(
		current.map((file) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`),
	)
	return [
		...current,
		...added.filter(
			(file) => !knownFiles.has(`${file.name}\u0000${file.size}\u0000${file.lastModified}`),
		),
	]
}
