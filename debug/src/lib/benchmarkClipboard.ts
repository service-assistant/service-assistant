import type { BenchmarkCase, BenchmarkCaseRun } from '@/lib/types'

function jsonSection(title: string, value: unknown): string {
	return `## ${title}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

export function formatBenchmarkCaseForClipboard(
	testCase: BenchmarkCase,
	run: BenchmarkCaseRun | null,
): string {
	const sections = [
		`# Benchmark case: ${testCase.title}`,
		`Mode: ${testCase.mode}\nCase ID: ${testCase.id}`,
		jsonSection('Case definition', testCase),
	]

	if (run) {
		sections.push(jsonSection('Latest run and complete result', run))
	} else {
		sections.push(
			'## Latest run and complete result\n\nThis case has not been run in this session.',
		)
	}

	return `${sections.join('\n\n')}\n`
}
