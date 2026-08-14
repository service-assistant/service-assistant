import { useState } from 'react'

const CONFIRM_PHRASE = 'tak, usuń'

export function ConfirmDeleteModal({
	title,
	description,
	onConfirm,
	onClose,
	pending,
}: {
	title: string
	description: string
	onConfirm: () => void
	onClose: () => void
	pending: boolean
}) {
	const [value, setValue] = useState('')

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
			<div className='w-full max-w-sm rounded-lg border border-line bg-panel p-6'>
				<h3 className='mb-2 text-lg font-semibold text-cream'>{title}</h3>
				<p className='mb-4 text-sm text-cream/70'>{description}</p>
				<p className='mb-2 text-sm text-cream/70'>
					Wpisz <span className='font-mono text-ember'>{CONFIRM_PHRASE}</span>, aby
					potwierdzić.
				</p>
				<input
					autoFocus
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className='mb-4 w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
				/>
				<div className='flex justify-end gap-2'>
					<button
						onClick={onClose}
						className='rounded-md px-4 py-2 text-sm text-cream/70 hover:text-cream'>
						Anuluj
					</button>
					<button
						disabled={value !== CONFIRM_PHRASE || pending}
						onClick={onConfirm}
						className='rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40'>
						{pending ? 'Usuwanie…' : 'Usuń'}
					</button>
				</div>
			</div>
		</div>
	)
}
