import { AddMachineWizard } from '@/pages/AddMachinePage'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const categories = [
	{ id: 1, name: 'Toyota', parent_id: null, depth: 0 },
	{ id: 2, name: 'Wózki widłowe', parent_id: 1, depth: 1 },
]

describe('AddMachineWizard category context', () => {
	it('preselects the category passed from the catalog tree', () => {
		const html = renderToStaticMarkup(
			<AddMachineWizard
				attachments={[]}
				flat={categories}
				initialCategoryId={2}
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		expect(html).toContain('<option value="2" selected="">— Wózki widłowe</option>')
	})

	it('does not select a category for the synthetic root folder', () => {
		const html = renderToStaticMarkup(
			<AddMachineWizard
				attachments={[]}
				flat={categories}
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		expect(html).toContain('<option value="" selected="">Wybierz katalog</option>')
	})
})
