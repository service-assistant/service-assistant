const authUrl = process.env.AUTH_URL?.trim().replace(/\/+$/, '') ?? '';

export function serverApiUrl(path: string) {
	if (!authUrl) {
		throw new Error('Brak AUTH_URL w środowisku tras API Expo.');
	}

	return `${authUrl}/${path.replace(/^\/+/, '')}`;
}
