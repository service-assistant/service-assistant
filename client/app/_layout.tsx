import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

// Expo Router configuration: ensures that reloading inside a modal or a nested screen
// retains the back button functionality by anchoring the navigation to the tabs layout.
export const unstable_settings = {
	anchor: '(tabs)',
};

// Root layout wrapper for the entire application.
// It handles global providers like safe area insets, navigation theming, and the base navigation stack.
export default function RootLayout() {
	// Detect the current system color scheme (light or dark mode) to apply the correct theme
	const colorScheme = useColorScheme();

	return (
		<SafeAreaProvider>
			<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
				<Stack>
					<Stack.Screen name='(tabs)' options={{ headerShown: false }} />
					<Stack.Screen
						name='modal'
						options={{ presentation: 'modal', title: 'Modal' }}
					/>
				</Stack>
				<StatusBar style='auto' />
			</ThemeProvider>
		</SafeAreaProvider>
	);
}
