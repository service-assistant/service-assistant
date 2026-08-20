import { useAuth } from '@/hooks/use-auth';
import { useState } from 'react';
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY_ORANGE = '#FF6B00';

export default function LoginScreen() {
	const { login } = useAuth();
	const [organizationSlug, setOrganizationSlug] = useState('');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const canSubmit = Boolean(organizationSlug && username && password) && !pending;

	const handleSubmit = async () => {
		setError(null);
		setPending(true);
		try {
			await login(organizationSlug, username, password);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Błąd logowania.');
		} finally {
			setPending(false);
		}
	};

	return (
		<SafeAreaView className='flex-1 bg-[#09090B]'>
			<KeyboardAvoidingView
				className='flex-1 items-center justify-center px-6'
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<View className='w-full max-w-sm rounded-lg border border-white/10 bg-[#18181B] p-8'>
					<Text className='mb-1 text-xl font-semibold text-white'>
						Asystent Serwisanta
					</Text>
					<Text className='mb-6 text-sm text-white/60'>Zaloguj się, aby rozpocząć.</Text>

					<Text className='mb-1 text-xs uppercase tracking-wide text-white/50'>
						Organizacja
					</Text>
					<TextInput
						autoFocus
						autoCapitalize='none'
						autoCorrect={false}
						value={organizationSlug}
						onChangeText={setOrganizationSlug}
						placeholder='np. acme'
						placeholderTextColor='#71717A'
						className='mb-4 rounded-md border border-white/10 bg-[#09090B] px-3 py-3 text-base text-white'
					/>

					<Text className='mb-1 text-xs uppercase tracking-wide text-white/50'>
						Login
					</Text>
					<TextInput
						autoCapitalize='none'
						autoCorrect={false}
						value={username}
						onChangeText={setUsername}
						className='mb-4 rounded-md border border-white/10 bg-[#09090B] px-3 py-3 text-base text-white'
					/>

					<Text className='mb-1 text-xs uppercase tracking-wide text-white/50'>
						Hasło
					</Text>
					<TextInput
						secureTextEntry
						value={password}
						onChangeText={setPassword}
						className='mb-4 rounded-md border border-white/10 bg-[#09090B] px-3 py-3 text-base text-white'
					/>

					{error && <Text className='mb-4 text-sm text-red-400'>{error}</Text>}

					<TouchableOpacity
						onPress={handleSubmit}
						disabled={!canSubmit}
						accessibilityRole='button'
						style={{ backgroundColor: PRIMARY_ORANGE, opacity: canSubmit ? 1 : 0.4 }}
						className='items-center justify-center rounded-md py-3'>
						{pending ? (
							<ActivityIndicator color='#09090B' />
						) : (
							<Text className='text-base font-semibold text-[#09090B]'>Zaloguj</Text>
						)}
					</TouchableOpacity>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
