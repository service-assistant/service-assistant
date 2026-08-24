import { APP_TOAST_EVENT, type AppToast } from '@/lib/toast'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ToastRegion() {
	const [toast, setToast] = useState<AppToast | null>(null)

	useEffect(() => {
		function handleToast(event: Event) {
			setToast((event as CustomEvent<AppToast>).detail)
		}

		window.addEventListener(APP_TOAST_EVENT, handleToast)
		return () => window.removeEventListener(APP_TOAST_EVENT, handleToast)
	}, [])

	useEffect(() => {
		if (!toast) return
		const timeout = window.setTimeout(() => setToast(null), 6000)
		return () => window.clearTimeout(timeout)
	}, [toast])

	if (!toast) return null

	return (
		<div
			role='status'
			aria-live='polite'
			className='fixed right-6 bottom-6 z-50 flex max-w-md items-center gap-3 rounded-lg border border-emerald-400/25 bg-[#151d27] px-4 py-3 text-sm text-[#e8eaed] shadow-2xl'>
			<CheckCircle2 size={19} className='shrink-0 text-emerald-400' />
			<span className='font-semibold'>{toast.message}</span>
			{toast.actionLabel && toast.actionTo && (
				<Link
					to={toast.actionTo}
					onClick={() => setToast(null)}
					className='shrink-0 text-xs font-extrabold text-[#ff921f] hover:text-[#ffad55]'>
					{toast.actionLabel}
				</Link>
			)}
			<button
				type='button'
				aria-label='Zamknij powiadomienie'
				onClick={() => setToast(null)}
				className='ml-1 cursor-pointer rounded p-1 text-[#9aa4b2] hover:text-[#e8eaed]'>
				<X size={15} />
			</button>
		</div>
	)
}
