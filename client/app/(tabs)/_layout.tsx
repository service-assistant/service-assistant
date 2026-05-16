import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
	const colorScheme = useColorScheme();

	return (
		<>
			{/* Hide the system status bar globally for all screens within this layout */}
			<StatusBar hidden={true} />

			<Tabs
				screenOptions={{
					tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
					headerShown: false,
					tabBarButton: HapticTab,
					// Disable the bottom navigation bar to maintain a full-screen UI
					tabBarStyle: { display: 'none' },
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
