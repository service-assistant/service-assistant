import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'SafeAreaView',
]);

export const unstable_settings = {
	anchor: '(tabs)',
};


export default function RootLayout() {
	const colorScheme = useColorScheme();

	return (
		<SafeAreaProvider>
		<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
			<Stack>
				<Stack.Screen name='(tabs)' options={{ headerShown: false }} />
				<Stack.Screen name='modal' options={{ presentation: 'modal', title: 'Modal' }} />
			</Stack>
			<StatusBar style='auto' />
		</ThemeProvider>
		</SafeAreaProvider>
	);
}
