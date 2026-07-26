import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Modal,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NameplateDeviceCandidate, NameplateRecognition } from '@/types/nameplate';
import { recognizeNameplate } from '@/utils/nameplate-api';
import { HttpError, isTransientNetworkError } from '@/utils/network';

type NameplateScannerModalProps = {
	visible: boolean;
	lightMode: boolean;
	onClose: () => void;
	onComplete: (
		recognition: NameplateRecognition,
		device: NameplateDeviceCandidate,
	) => Promise<void>;
	onServiceError: (featureName: string, error: unknown) => void;
};

const OCR_PICTURE_TARGET_PIXELS = 2_500_000;
const OcrCameraView = CameraView as React.ComponentType<
	React.ComponentProps<typeof CameraView> & {
		animateShutter?: boolean;
		pictureSize?: string;
		onCameraReady?: () => void;
		onMountError?: (event: { message: string }) => void;
	}
>;

export const selectOcrPictureSize = (sizes: string[]): string | undefined =>
	sizes
		.map((size) => {
			const match = /^(\d+)x(\d+)$/.exec(size);
			if (!match) return null;
			return {
				size,
				pixels: Number(match[1]) * Number(match[2]),
			};
		})
		.filter((item): item is { size: string; pixels: number } => item !== null)
		.sort(
			(left, right) =>
				Math.abs(left.pixels - OCR_PICTURE_TARGET_PIXELS) -
				Math.abs(right.pixels - OCR_PICTURE_TARGET_PIXELS),
		)[0]?.size;

export default function NameplateScannerModal({
	visible,
	lightMode,
	onClose,
	onComplete,
	onServiceError,
}: NameplateScannerModalProps) {
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const [permission, requestPermission] = useCameraPermissions();
	const [photoUri, setPhotoUri] = useState<string | null>(null);
	const [recognition, setRecognition] = useState<NameplateRecognition | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [pictureSize, setPictureSize] = useState<string | undefined>();
	const [isCameraReady, setIsCameraReady] = useState(false);
	const [isCapturing, setIsCapturing] = useState(false);
	const cameraRef = useRef<any>(null);
	const abortRef = useRef<AbortController | null>(null);
	const requestPermissionRef = useRef(requestPermission);

	useEffect(() => {
		requestPermissionRef.current = requestPermission;
	}, [requestPermission]);

	useEffect(() => {
		if (!visible) return;
		setPhotoUri(null);
		setRecognition(null);
		setMessage(null);
		setPictureSize(undefined);
		setIsCameraReady(false);
		setIsCapturing(false);
		void requestPermissionRef.current();

		return () => {
			abortRef.current?.abort();
			abortRef.current = null;
		};
	}, [visible]);

	const resetCapture = () => {
		setPhotoUri(null);
		setRecognition(null);
		setMessage(null);
		setIsCameraReady(false);
	};

	const close = () => {
		abortRef.current?.abort();
		setIsProcessing(false);
		resetCapture();
		onClose();
	};

	const takePhoto = async () => {
		if (!isCameraReady || isCapturing) return;
		setIsCapturing(true);
		setMessage(null);
		try {
			const photo = await cameraRef.current?.takePictureAsync?.({
				quality: 0.78,
				// Pełne przetwarzanie potrafi zatrzymać podgląd na białej klatce
				// na części urządzeń z Androidem. Ekran jest zablokowany w pionie,
				// więc szybki zapis nie powoduje tu problemów z orientacją.
				skipProcessing: Platform.OS === 'android',
				shutterSound: false,
			});
			if (photo?.uri) {
				setPhotoUri(photo.uri);
			} else {
				setMessage('Aparat nie zapisał zdjęcia. Spróbuj ponownie.');
			}
		} catch (error) {
			onServiceError('kamera tabliczki', error);
			setMessage('Nie udało się zrobić zdjęcia. Spróbuj ponownie.');
		} finally {
			setIsCapturing(false);
		}
	};

	const handleCameraReady = async () => {
		try {
			if (pictureSize) {
				setIsCameraReady(true);
				return;
			}
			const availableSizes =
				(await cameraRef.current?.getAvailablePictureSizesAsync?.()) ?? [];
			const selectedSize = selectOcrPictureSize(availableSizes);
			if (selectedSize) {
				setPictureSize(selectedSize);
			}
		} catch (error) {
			console.log('Could not select an OCR camera resolution:', error);
		}
		setIsCameraReady(true);
	};

	const finishWithDevice = async (
		currentRecognition: NameplateRecognition,
		device: NameplateDeviceCandidate,
	) => {
		setIsProcessing(true);
		try {
			await onComplete(currentRecognition, device);
			close();
		} catch (error) {
			setIsProcessing(false);
			setMessage('Nie udało się zapisać rozpoznanej tabliczki. Spróbuj ponownie.');
			onServiceError('zapis danych tabliczki', error);
		}
	};

	const analyzePhoto = async () => {
		if (!photoUri || isProcessing) return;
		setIsProcessing(true);
		setMessage(null);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const result = await recognizeNameplate(photoUri, controller.signal);
			setRecognition(result);
			if (result.matched_device && !result.requires_confirmation) {
				await finishWithDevice(result, result.matched_device);
				return;
			}
			if (result.candidates.length === 0) {
				setMessage(
					`Odczytano model „${result.nameplate_data.model}”, ale nie znaleziono go w katalogu.`,
				);
			}
		} catch (error: any) {
			if (error?.name !== 'AbortError') {
				const isNameplateNotFound = error instanceof HttpError && error.status === 422;
				const detail = isNameplateNotFound
					? 'Nie znaleziono czytelnej tabliczki znamionowej. Ustaw ją na środku kadru, zbliż aparat, unikaj odblasków i zrób zdjęcie ponownie.'
					: isTransientNetworkError(error)
						? 'Chwilowy problem z połączeniem. Sprawdź sieć i spróbuj ponownie.'
						: error instanceof Error && error.message.trim()
							? error.message.trim()
							: 'Nieznany błąd rozpoznawania.';
				setMessage(
					isNameplateNotFound
						? detail
						: `Nie udało się odczytać tabliczki. Szczegóły: ${detail}`,
				);
				if (!isNameplateNotFound) {
					onServiceError('rozpoznawanie tabliczki', error);
				}
			}
		} finally {
			if (abortRef.current === controller) {
				abortRef.current = null;
				setIsProcessing(false);
			}
		}
	};

	const foreground = lightMode ? '#18181B' : '#FFFFFF';
	const background = lightMode ? '#F7F7F8' : '#09090B';
	const panel = lightMode ? '#FFFFFF' : '#18181B';
	const border = lightMode ? '#E4E4E7' : '#3F3F46';
	const scannerHeaderHeight = 62;
	const availableWidth = Math.max(1, width - insets.left - insets.right);
	const availableHeight = Math.max(1, height - insets.top - insets.bottom - scannerHeaderHeight);
	const cameraRatio = 4 / 3;
	const previewWidth = Math.min(availableWidth, availableHeight * cameraRatio);
	const previewHeight = previewWidth / cameraRatio;

	return (
		<Modal visible={visible} animationType='slide' onRequestClose={close}>
			<SafeAreaView style={{ flex: 1, backgroundColor: background }}>
				<View
					className='z-20 flex-row items-center px-4 border-b'
					style={{
						height: scannerHeaderHeight,
						borderColor: border,
						backgroundColor: background,
					}}>
					<TouchableOpacity
						onPress={close}
						accessibilityRole='button'
						accessibilityLabel='Zamknij skaner'
						className='w-11 h-11 items-center justify-center'>
						<MaterialCommunityIcons name='close' size={28} color='#FF6B00' />
					</TouchableOpacity>
					<Text
						className='flex-1 text-center text-lg font-bold'
						style={{ color: foreground }}>
						SKANUJ TABLICZKĘ
					</Text>
					<View className='w-11' />
				</View>

				{recognition?.requires_confirmation && recognition.candidates.length > 0 ? (
					<ScrollView
						contentContainerStyle={{
							padding: 20,
							paddingBottom: insets.bottom + 24,
						}}>
						<Text className='text-xl font-bold mb-2' style={{ color: foreground }}>
							Rozpoznano: {recognition.nameplate_data.model}
						</Text>
						<Text className='mb-5' style={{ color: lightMode ? '#52525B' : '#A1A1AA' }}>
							{recognition.candidates.length === 1
								? 'Czy to na pewno ten model? Potwierdź wybór lub wykonaj zdjęcie ponownie.'
								: 'Wybierz właściwy model lub wykonaj zdjęcie ponownie.'}
						</Text>
						{recognition.candidates.map((candidate) => (
							<TouchableOpacity
								key={candidate.id}
								onPress={() => void finishWithDevice(recognition, candidate)}
								disabled={isProcessing}
								className='mb-3 rounded-[14px] border p-4'
								style={{ backgroundColor: panel, borderColor: border }}>
								<Text className='text-lg font-bold' style={{ color: foreground }}>
									{candidate.name}
								</Text>
								<Text className='mt-1 text-sm' style={{ color: '#FF6B00' }}>
									Dopasowano: {candidate.matched_identifier}
								</Text>
							</TouchableOpacity>
						))}
						<TouchableOpacity
							onPress={resetCapture}
							className='mt-2 h-14 rounded-[12px] border items-center justify-center'
							style={{ borderColor: border }}>
							<Text className='font-bold' style={{ color: foreground }}>
								ZRÓB PONOWNIE
							</Text>
						</TouchableOpacity>
					</ScrollView>
				) : (
					<View className='flex-1 bg-black items-center justify-center'>
						{photoUri ? (
							<Image
								key={photoUri}
								source={{ uri: photoUri }}
								className='absolute inset-0'
								style={{ width: '100%', height: '100%' }}
								resizeMode='contain'
								onError={() => {
									setPhotoUri(null);
									setMessage(
										'Nie udało się wyświetlić zdjęcia. Zrób je ponownie.',
									);
								}}
							/>
						) : permission?.granted ? (
							<OcrCameraView
								ref={cameraRef}
								style={{
									width: previewWidth,
									height: previewHeight,
								}}
								facing='back'
								pictureSize={pictureSize}
								animateShutter={false}
								onCameraReady={() => void handleCameraReady()}
								onMountError={(event) => {
									setIsCameraReady(false);
									setMessage(`Nie udało się uruchomić aparatu: ${event.message}`);
								}}
							/>
						) : (
							<View className='flex-1 items-center justify-center px-8'>
								<MaterialCommunityIcons
									name='camera-off'
									size={44}
									color='#A1A1AA'
								/>
								<Text className='text-center mt-4' style={{ color: '#D4D4D8' }}>
									Zezwól aplikacji na korzystanie z aparatu.
								</Text>
								<TouchableOpacity
									onPress={() => void requestPermission()}
									className='mt-5 rounded-[12px] bg-[#FF6B00] px-5 py-3'>
									<Text className='text-white font-bold'>UDZIEL ZGODY</Text>
								</TouchableOpacity>
							</View>
						)}

						{message ? (
							<View className='absolute left-4 right-4 bottom-28 rounded-[12px] bg-black/75 px-4 py-3'>
								<Text className='text-center text-sm' style={{ color: '#FCA5A5' }}>
									{message}
								</Text>
							</View>
						) : null}

						<View className='absolute bottom-0 left-0 right-0 flex-row justify-center gap-3 bg-black/60 px-4 py-4'>
							{photoUri ? (
								<>
									<TouchableOpacity
										onPress={resetCapture}
										disabled={isProcessing}
										className='h-14 px-5 rounded-[12px] border border-white/50 bg-black/40 items-center justify-center'>
										<Text className='font-bold text-white'>PONÓW</Text>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={() => void analyzePhoto()}
										disabled={isProcessing}
										className='h-14 px-7 rounded-[12px] bg-[#FF6B00] items-center justify-center'>
										<Text className='text-white font-bold'>ROZPOZNAJ</Text>
									</TouchableOpacity>
								</>
							) : permission?.granted ? (
								<TouchableOpacity
									onPress={() => void takePhoto()}
									disabled={!isCameraReady || isCapturing}
									className='w-20 h-20 rounded-full border-[6px] border-[#FF6B00] items-center justify-center'
									style={{
										backgroundColor:
											isCameraReady && !isCapturing ? '#FFFFFF' : '#71717A',
										opacity: isCameraReady && !isCapturing ? 1 : 0.7,
									}}>
									{isCapturing ? (
										<ActivityIndicator color='#FF6B00' />
									) : (
										<View className='w-12 h-12 rounded-full bg-white' />
									)}
								</TouchableOpacity>
							) : null}
						</View>

						{isProcessing ? (
							<View className='absolute inset-0 bg-black/70 items-center justify-center'>
								<ActivityIndicator size='large' color='#FF6B00' />
								<Text className='text-white font-bold mt-4'>
									ODCZYTUJĘ TABLICZKĘ…
								</Text>
							</View>
						) : null}
					</View>
				)}
			</SafeAreaView>
		</Modal>
	);
}
