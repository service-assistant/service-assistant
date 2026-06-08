import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

const PRIMARY_ORANGE = '#FF7A00';

type ServiceErrorModalProps = {
	visible: boolean;
	featureName: string;
	onClose: () => void;
	dismissible?: boolean;
};

export default function ServiceErrorModal({
	visible,
	featureName,
	onClose,
	dismissible = true,
}: ServiceErrorModalProps) {
	return (
		<Modal
			transparent
			visible={visible}
			animationType='fade'
			onRequestClose={dismissible ? onClose : undefined}>
			<View className='flex-1 items-center justify-center bg-black/70 px-5'>
				<View
					className='w-full max-w-[420px] border border-[#303030] bg-[#111111] px-6 py-6'
					style={{ borderRadius: 8 }}>
					<View className='items-center'>
						<View
							className='items-center justify-center border border-[#3A2A1D] bg-[#1C140E]'
							style={{ width: 56, height: 56, borderRadius: 28 }}>
							<Feather name='alert-triangle' size={27} color={PRIMARY_ORANGE} />
						</View>

						<Text className='mt-5 text-center text-[21px] font-bold text-white'>
							Aplikacja natrafiła na błąd
						</Text>
						<Text className='mt-3 text-center text-[15px] leading-6 text-[#D4D4D8]'>
							Funkcja „{featureName}” chwilowo nie działa. Administrator został
							poinformowany. Przepraszamy.
						</Text>

						{dismissible ? (
							<Pressable
								onPress={onClose}
								className='mt-6 h-12 w-full items-center justify-center bg-[#FF7A00]'
								style={{ borderRadius: 6 }}>
								<Text className='text-[13px] font-bold tracking-wider text-white'>
									ROZUMIEM
								</Text>
							</Pressable>
						) : null}
					</View>
				</View>
			</View>
		</Modal>
	);
}
