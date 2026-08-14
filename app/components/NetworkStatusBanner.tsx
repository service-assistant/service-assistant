import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useNetworkStatus } from '@/hooks/use-network-status';

export default function NetworkStatusBanner() {
	const { isOffline } = useNetworkStatus();
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (!isOffline) {
			setIsVisible(false);
			return;
		}

		const timeout = setTimeout(() => setIsVisible(true), 2000);
		return () => clearTimeout(timeout);
	}, [isOffline]);

	if (!isVisible) return null;

	return (
		<View
			pointerEvents='none'
			className='absolute left-0 right-0 top-0 z-50 items-center bg-[#B45309] px-4 py-2'>
			<Text className='text-center text-sm font-semibold text-white'>
				Brak połączenia. Aplikacja połączy się ponownie automatycznie.
			</Text>
		</View>
	);
}
