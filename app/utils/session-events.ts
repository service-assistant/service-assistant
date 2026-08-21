/** Lets `throwIfAuthResponseError` (called from every authenticated fetch
 * site) trigger a real logout without importing React/AuthProvider — the
 * provider registers itself as the listener on mount. */
type SessionInvalidatedListener = () => void;

let listener: SessionInvalidatedListener | null = null;

export const onSessionInvalidated = (fn: SessionInvalidatedListener | null): void => {
	listener = fn;
};

export const notifySessionInvalidated = (): void => {
	listener?.();
};
