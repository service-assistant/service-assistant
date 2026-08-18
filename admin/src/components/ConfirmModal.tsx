export function ConfirmModal({
	title,
	description,
	confirmLabel,
	pendingLabel,
	onConfirm,
	onClose,
	pending,
}: {
	title: string
	description: string
	confirmLabel: string
	pendingLabel: string
	onConfirm: () => void
	onClose: () => void
	pending: boolean
}) {
	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
			<div className='w-full max-w-sm rounded-lg border border-line bg-panel p-6'>
				<h3 className='mb-2 text-lg font-semibold text-cream'>{title}</h3>
				<p className='mb-5 text-sm text-cream/70'>{description}</p>
				<div className='flex justify-end gap-2'>
					<button
						onClick={onClose}
						className='cursor-pointer rounded-md px-4 py-2 text-sm text-cream/70 hover:text-cream'>
						Anuluj
					</button>
					<button
						disabled={pending}
						onClick={onConfirm}
						className='cursor-pointer rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40'>
						{pending ? pendingLabel : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
