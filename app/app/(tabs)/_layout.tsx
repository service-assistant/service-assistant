import { Tabs } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/ui/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { getAppSettings } from '@/hooks/use-app-settings';

export default function TabLayout() {
	const { lightThemeEnabled } = getAppSettings();
	const colorScheme = lightThemeEnabled ? 'light' : 'dark';
	const { width, height } = useWindowDimensions();
	const isPhone = Math.min(width, height) < 600;

	useEffect(() => {
		if (isPhone) {
			ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
			return;
		}

		ScreenOrientation.unlockAsync();
	}, [isPhone]);

	return (
		<>
			{/* Hide the system status bar globally for all screens within this layout */}
			<StatusBar hidden={true} />

			<Tabs
				tabBar={() => null}
				screenOptions={{
					tabBarActiveTintColor: Colors[colorScheme].tint,
					headerShown: false,
					tabBarButton: HapticTab,
				}}>
				<Tabs.Screen
					name='index'
					options={{
						title: 'Home',
						tabBarIcon: ({ color }) => (
							<IconSymbol size={28} name='house.fill' color={color} />
						),
					}}
				/>
			</Tabs>
		</>
	);
}
