export type AppToast = {
	message: string
	actionLabel?: string
	actionTo?: '/queue'
}

export const APP_TOAST_EVENT = 'fixo:toast'

export function showToast(toast: AppToast): void {
	window.dispatchEvent(new CustomEvent<AppToast>(APP_TOAST_EVENT, { detail: toast }))
}
