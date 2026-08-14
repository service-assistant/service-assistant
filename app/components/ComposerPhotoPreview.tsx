import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, TouchableOpacity, View } from 'react-native';

type ComposerPhotoPreviewProps = {
	photoUri: string;
	onRemove: () => void;
	size?: number;
};

export default function ComposerPhotoPreview({
	photoUri,
	onRemove,
	size = 104,
}: ComposerPhotoPreviewProps) {
	return (
		<View style={{ width: size, height: size }}>
			<Image
				source={{ uri: photoUri }}
				style={{ width: size, height: size, borderRadius: 14 }}
				resizeMode='cover'
			/>
			<TouchableOpacity
				onPress={onRemove}
				accessibilityRole='button'
				accessibilityLabel='Usuń dodane zdjęcie'
				className='absolute items-center justify-center'
				style={{
					top: 5,
					right: 5,
					width: 30,
					height: 30,
					borderRadius: 15,
					backgroundColor: 'rgba(24, 24, 27, 0.88)',
					borderWidth: 1,
					borderColor: 'rgba(255, 255, 255, 0.28)',
				}}>
				<Feather name='x' size={20} color='#FFFFFF' />
			</TouchableOpacity>
		</View>
	);
}
