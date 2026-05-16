import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Renders a basic modal screen using NativeWind for utility-first styling
export default function ModalScreen() {
	return (
		<ThemedView className='flex-1 items-center justify-center p-5'>
			<ThemedText type='title'>This is a modal</ThemedText>
			<Link href='/' dismissTo className='mt-[15px] py-[15px]'>
				<ThemedText type='link'>Go to home screen</ThemedText>
			</Link>
		</ThemedView>
	);
}
