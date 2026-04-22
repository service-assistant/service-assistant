import { Tabs } from 'expo-router';
import React from 'react';
// 1. Dodajemy import paska statusu
import { StatusBar } from 'expo-status-bar';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
	const colorScheme = useColorScheme();

	return (
		// 2. Owijamy całość w pusty tag (Fragment), żeby React nie narzekał
		<>
			{/* 3. MAGIA: Ukrywa pasek systemowy Android/iOS na wszystkich ekranach wewnątrz tabsów */}
			<StatusBar hidden={true} />

			<Tabs
				screenOptions={{
					tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
					headerShown: false,
					tabBarButton: HapticTab,
					// Ukrywasz dolny pasek - super rozwiązanie dla trybu pełnoekranowego!
					tabBarStyle: { display: 'none' },
				}}>
				<Tabs.Screen
					name="index"
					options={{
						title: 'Home',
						tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
					}}
				/>
			</Tabs>
		</>
	);
}