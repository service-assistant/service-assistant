import { describe, expect, test } from 'vitest'
import { formatBenchmarkCaseForClipboard } from '@/lib/benchmarkClipboard'
import type { BenchmarkCase, BenchmarkCaseRun } from '@/lib/types'

const standardCase: BenchmarkCase = {
	id: 'standard-1',
	title: 'Standard case',
	category: 'manual',
	question: 'How do I reset it?',
	mode: 'standard',
	expected_route: 'standard_query',
	canonical_fault_code: null,
	reference_answer: 'Follow the reset procedure.',
	required_facts: ['Press reset.'],
	required_behaviors: ['Mention safety.'],
	forbidden_claims: ['Do not bypass the guard.'],
	source: { filename: 'manual.pdf', locator: 'Reset', page: 12 },
	evaluation_mode: 'llm',
	minimum_source_images: 0,
	assumptions: [],
	simulation_facts: {},
}

test('formats a standard case and its complete result as structured Markdown', () => {
	const run: BenchmarkCaseRun = {
		id: 'run-1',
		case_id: standardCase.id,
		state: 'completed',
		created_at: '2026-09-11T10:00:00Z',
		evaluate: true,
		finished_at: '2026-09-11T10:00:01Z',
		error: null,
		result: { answer: 'Reset safely.', chunks_after_reranker: [{ id: 42 }] },
		cancel_requested: false,
	}

	const text = formatBenchmarkCaseForClipboard(standardCase, run)

	expect(text).toContain('# Benchmark case: Standard case')
	expect(text).toContain('Mode: standard')
	expect(text).toContain('## Case definition')
	expect(text).toContain('## Latest run and complete result')
	expect(text).toContain('"chunks_after_reranker"')
	expect(text).toContain('"id": 42')
})

describe('agent cases', () => {
	test('preserves assumptions and simulation facts even before a run', () => {
		const agentCase: BenchmarkCase = {
			...standardCase,
			id: 'agent-1',
			title: 'Agent case',
			mode: 'agent',
			assumptions: [
				{
					key: 'pressure',
					statement: 'Pressure is low.',
					source_locator: 'Troubleshooting',
					source_page: 8,
				},
			],
			simulation_facts: {
				pressure: {
					value: 2,
					unit: 'bar',
					technician_reply: 'It reads 2 bar.',
					aliases: ['system pressure'],
				},
			},
		}

		const text = formatBenchmarkCaseForClipboard(agentCase, null)

		expect(text).toContain('Mode: agent')
		expect(text).toContain('"statement": "Pressure is low."')
		expect(text).toContain('"technician_reply": "It reads 2 bar."')
		expect(text).toContain('This case has not been run in this session.')
	})
})
