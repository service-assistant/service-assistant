/** Polish plural suffix selection: 1 → singular, 2-4 (not 12-14) → few, else → many. */
export function pluralizePl(count: number, singular: string, few: string, many: string): string {
	if (count === 1) return singular
	const lastDigit = count % 10
	const lastTwo = count % 100
	if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few
	return many
}

export function machineCountLabel(count: number): string {
	return `${count} ${pluralizePl(count, 'maszyna', 'maszyny', 'maszyn')}`
}

export function documentCountLabel(count: number): string {
	return `${count} ${pluralizePl(count, 'dokument', 'dokumenty', 'dokumentów')}`
}

export function pageCountLabel(count: number): string {
	return `${count} ${pluralizePl(count, 'strona', 'strony', 'stron')}`
}

export function selectedLabel(count: number): string {
	return `Wybrano: ${count} ${pluralizePl(count, 'pozycja', 'pozycje', 'pozycji')}`
}
