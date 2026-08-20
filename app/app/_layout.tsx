import NetworkStatusBanner from '@/components/feedback/NetworkStatusBanner';
import { useAppSettings } from '@/hooks/use-app-settings';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { NetworkStatusProvider } from '@/hooks/use-network-status';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

// Expo Router configuration: ensures that reloading inside a modal or a nested screen
// retains the back button functionality by anchoring the navigation to the tabs layout.
export const unstable_settings = {
	anchor: '(tabs)',
};

function AuthGate({ children }: { children: ReactNode }) {
	const { authenticated } = useAuth();
	const router = useRouter();
	const segments = useSegments();

	useEffect(() => {
		if (authenticated === null) return;
		const onLoginRoute = segments[0] === 'login';
		if (!authenticated && !onLoginRoute) {
			router.replace('/login');
		} else if (authenticated && onLoginRoute) {
			router.replace('/(tabs)');
		}
	}, [authenticated, segments, router]);

	if (authenticated === null) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator size='large' color='#FF6B00' />
			</View>
		);
	}

	return children;
}

// Root layout wrapper for the entire application.
// It handles global providers like safe area insets, navigation theming, and the base navigation stack.
export default function RootLayout() {
	const { lightThemeEnabled } = useAppSettings();

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<KeyboardProvider preload={false}>
				<SafeAreaProvider>
					<NetworkStatusProvider>
						<ThemeProvider value={lightThemeEnabled ? DefaultTheme : DarkTheme}>
							<AuthProvider>
								<AuthGate>
									<Stack>
										<Stack.Screen
											name='login'
											options={{ headerShown: false }}
										/>
										<Stack.Screen
											name='(tabs)'
											options={{ headerShown: false }}
										/>
										<Stack.Screen
											name='modal'
											options={{ presentation: 'modal', title: 'Modal' }}
										/>
									</Stack>
								</AuthGate>
							</AuthProvider>
							<NetworkStatusBanner />
							<StatusBar hidden={true} />
						</ThemeProvider>
					</NetworkStatusProvider>
				</SafeAreaProvider>
			</KeyboardProvider>
		</GestureHandlerRootView>
	);
}
