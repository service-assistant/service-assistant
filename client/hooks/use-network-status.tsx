import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

type NetworkStatus = {
	isOffline: boolean;
	reconnectCount: number;
};

const NetworkStatusContext = createContext<NetworkStatus>({ isOffline: false, reconnectCount: 0 });

export const NetworkStatusProvider = ({ children }: React.PropsWithChildren) => {
	const [isOffline, setIsOffline] = useState(false);
	const [reconnectCount, setReconnectCount] = useState(0);
	const wasOffline = useRef(false);

	useEffect(
		() =>
			NetInfo.addEventListener((state) => {
				const nextOffline =
					state.isConnected === false || state.isInternetReachable === false;

				if (wasOffline.current && !nextOffline) {
					setReconnectCount((count) => count + 1);
				}
				wasOffline.current = nextOffline;
				setIsOffline(nextOffline);
			}),
		[],
	);

	return (
		<NetworkStatusContext.Provider value={{ isOffline, reconnectCount }}>
			{children}
		</NetworkStatusContext.Provider>
	);
};

export const useNetworkStatus = () => useContext(NetworkStatusContext);
