import type { ReactNode } from 'react'

export function PageHeader({
	title,
	subtitle,
	meta,
}: {
	title: string
	subtitle: string
	meta?: ReactNode
}) {
	return (
		<div className='relative mb-6 overflow-hidden rounded-lg border border-line border-l-4 border-l-ember bg-gradient-to-br from-panel-soft to-panel px-6 py-6'>
			<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,138,0,0.22),transparent_55%)]' />
			<h1 className='relative text-4xl font-extrabold text-cream'>{title}</h1>
			<p className='relative mt-1.5 text-sm text-cream/60'>{subtitle}</p>
			{meta && <p className='relative mt-3 text-xs text-cream/40'>{meta}</p>}
		</div>
	)
}
