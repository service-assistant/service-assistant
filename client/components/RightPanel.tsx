import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Animated,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import PdfViewer from './PdfViewer';

// --- MOCK DATA ---

const AVAILABLE_FILES = [
	{
		id: 1,
		name: 'Instrukcja_Obslugi_Toyota.pdf',
		icon: 'forklift',
		color: '#06B6D4',
		source: require('../assets/instrukcje.pdf'),
	},
	{
		id: 2,
		name: 'Schematy_Elektryczne.pdf',
		icon: 'lightning-bolt',
		color: '#EAB308',
		source: require('../assets/instrukcje.pdf'),
	},
	{
		id: 3,
		name: 'Katalog_Czesci_2024.pdf',
		icon: 'cogs',
		color: '#A855F7',
		source: require('../assets/instrukcje.pdf'),
	},
	{
		id: 4,
		name: 'Biuletyn_Serwisowy.pdf',
		icon: 'wrench-outline',
		color: '#3B82F6',
		source: require('../assets/instrukcje.pdf'),
	},
	{
		id: 5,
		name: 'kody_awarii.pdf',
		icon: 'alert-outline',
		color: '#EF4444',
		source: require('../assets/instrukcje.pdf'),
	},
	{
		id: 6,
		name: 'Instrukcja_BHP_Wozki.pdf',
		icon: 'shield-check-outline',
		color: '#22C55E',
		source: require('../assets/instrukcje.pdf'),
	},
];

const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';

// --- INTERFACES ---

export interface PdfDocument {
	name: string;
	icon: string;
	color: string;
	source: { uri: string; headers?: Record<string, string> } | number;
	page: number;
}

export interface RightPanelProps {
	currentSource: string;
	attachmentId: number | null;
	attachmentName: string;
	attachmentPage: number;
	hasAskedQuestion: boolean;
	currentImage: string | null;
	isLoading: boolean;
	selectedPdf: PdfDocument | null;
	onSelectPdf: (pdf: PdfDocument | null) => void;
	showSchema: boolean;
	setShowSchema: (show: boolean) => void;
	setCurrentImage: (image: string | null) => void;
	isListening: boolean;
	onMicPress: () => void;
	soundLevelAnim: Animated.Value;
	isGenerating: boolean;
	onStop: () => void;
}

/**
 * RightPanel Component
 *
 * Responsible for rendering the document viewer, schema images, and the grid of available files.
 * Adapts its layout based on the screen width (Mobile vs. Desktop/Tablet).
 */
export default function RightPanel({
	currentSource,
	attachmentId,
	attachmentName,
	attachmentPage,
	hasAskedQuestion,
	currentImage,
	isLoading: isApiLoading,
	selectedPdf,
	onSelectPdf,
	showSchema,
	setShowSchema,
	setCurrentImage,
	isListening,
	onMicPress,
	soundLevelAnim,
	isGenerating,
	onStop,
}: RightPanelProps) {
	const { width } = useWindowDimensions();
	const isMobile = width < 768;

	const [isDownloading, setIsDownloading] = useState<boolean>(false);
	const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
	const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

	// TODO: Replace '1' with dynamic attachmentId when API logic is fully implemented
	const dynamicPdfUrl = `https://staging.asystent-serwisanta.pl/api/attachments/${1}/file`;
	const dynamicFileName = attachmentName || 'instrukcja_serwisowa.pdf';

	/**
	 * Generates HTML for an inverted image view (useful for dark mode schemas).
	 *
	 * @param imageUrl - URL of the image to display.
	 * @returns Raw HTML string.
	 */
	const getInvertedImageHtml = (imageUrl: string) => `
      <!DOCTYPE html>
      <html>
      <head>
         <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
         <style>
            html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #000000; display: flex; justify-content: center; align-items: center; overflow: hidden; }
            img { width: 100%; height: 100%; object-fit: contain; filter: invert(100%); }
         </style>
      </head>
      <body><img src="${imageUrl}" /></body>
      </html>
    `;

	/**
	 * Handles downloading a PDF file from a remote server.
	 * Functions differently on Web (passes URI directly) vs Native (downloads via FileSystem).
	 *
	 * @param remoteUrl - API endpoint to download from.
	 * @param localFilename - Desired filename for local storage.
	 * @param displayName - Name to display in the UI.
	 * @param fileIdForGrid - Associated file ID to display loading indicators correctly.
	 * @param targetPage - The page to open after the document is loaded.
	 */
	const performDownload = async (
		remoteUrl: string,
		localFilename: string,
		displayName: string,
		fileIdForGrid: number | null = null,
		targetPage: number = 1,
	) => {
		if (isDownloading) return;

		setIsDownloading(true);
		setDownloadingFileId(fileIdForGrid);

		try {
			// Artificial delay to simulate processing or network latency
			await new Promise((resolve) => setTimeout(resolve, 3000));

			if (Platform.OS === 'web') {
				setShowSchema(false);
				onSelectPdf({
					name: displayName,
					icon: 'file-download',
					color: '#22C55E',
					source: {
						uri: remoteUrl,
						headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
					},
					page: targetPage,
				});
			} else {
				const fileUri = FileSystem.documentDirectory + localFilename;

				downloadResumableRef.current = FileSystem.createDownloadResumable(
					remoteUrl,
					fileUri,
					{ headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
				);

				const result = await downloadResumableRef.current.downloadAsync();

				if (result && result.uri) {
					setShowSchema(false);
					onSelectPdf({
						name: displayName,
						icon: 'file-download',
						color: '#22C55E',
						source: { uri: result.uri },
						page: targetPage,
					});
				} else {
					throw new Error('Download failed - no URI');
				}
			}
		} catch (e) {
			console.error('Download error:', e);
			Alert.alert('Błąd', `Nie udało się pobrać pliku: ${displayName}`);
		} finally {
			setIsDownloading(false);
			setDownloadingFileId(null);
			downloadResumableRef.current = null;
		}
	};

	/**
	 * Triggered when a file from the mock grid is selected.
	 */
	const handleFileGridPress = async (file: (typeof AVAILABLE_FILES)[0]) => {
		await performDownload(dynamicPdfUrl, dynamicFileName, file.name, file.id, 1);
	};

	/**
	 * Renders the toggle button to switch between PDF viewer and Image Schema viewer.
	 */
	const renderSourceButton = () => {
		if (!currentImage) return null;

		return (
			<TouchableOpacity
				onPress={() => {
					if (showSchema) {
						performDownload(
							dynamicPdfUrl,
							dynamicFileName,
							dynamicFileName,
							null,
							attachmentPage || 1,
						);
					} else {
						setShowSchema(true);
					}
				}}
				disabled={isDownloading}
				className={`flex-row items-center border ${isDownloading ? 'border-neutral-700 bg-neutral-900' : 'border-[#CC5500] bg-[#0a0a0a]'} px-4 py-3 rounded-md min-w-[170px] justify-center`}>
				{isDownloading && downloadingFileId === null ? (
					<View className='flex-row items-center'>
						<ActivityIndicator size='small' color='#fff' />
						<Text className='text-white font-bold ml-3 tracking-widest text-[11px] uppercase'>
							POBIERANIE...
						</Text>
					</View>
				) : (
					<View className='flex-row items-center'>
						<Feather name={showSchema ? 'image' : 'layers'} size={18} color='#CC5500' />
						<Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>
							{showSchema ? 'POKAŻ ŹRÓDŁO' : 'POKAŻ SCHEMAT'}
						</Text>
					</View>
				)}
			</TouchableOpacity>
		);
	};

	// --- MOBILE VIEW (FILES + CHAT) ---
	if (isMobile) {
		return (
			<View className='flex-1 bg-black p-4 pb-8 justify-between'>
				{/* Header */}
				<View className='flex-row justify-between items-center mt-6'>
					<TouchableOpacity className='border border-[#d35400] p-3 rounded-lg bg-black'>
						<Feather name='arrow-left' size={20} color='#d35400' />
					</TouchableOpacity>

					<View className='flex-row items-center'>
						<Text className='text-white font-bold text-lg mr-2'>TOYOTA</Text>
						<Text className='text-white font-semibold text-md'>{currentSource}</Text>
					</View>

					<TouchableOpacity className='border border-[#d35400] p-3 rounded-lg bg-black'>
						<MaterialCommunityIcons name='robot-outline' size={22} color='#d35400' />
					</TouchableOpacity>
				</View>

				{/* Main Content: Files / Schema Section */}
				{selectedPdf ? (
					<View className='flex-1 mt-8 mb-4 relative'>
						<PdfViewer
							source={selectedPdf?.source || require('../assets/instrukcje.pdf')}
							page={selectedPdf?.page || 1}
						/>
						<TouchableOpacity
							onPress={() => onSelectPdf(null)}
							className='absolute top-2 right-2 bg-black/80 p-2 rounded-full z-10'>
							<Feather name='x' size={20} color='#fff' />
						</TouchableOpacity>
					</View>
				) : showSchema && currentImage ? (
					<View className='flex-1 mt-8 mb-4 rounded-xl overflow-hidden bg-black relative'>
						{Platform.OS === 'web' ? (
							<View
								style={{
									flex: 1,
									backgroundColor: '#000',
									justifyContent: 'center',
									alignItems: 'center',
								}}>
								<img
									src={currentImage}
									style={{
										width: '100%',
										height: '100%',
										objectFit: 'contain',
										filter: 'invert(100%)',
									}}
									alt='Schemat'
								/>
							</View>
						) : (
							<WebView
								source={{ html: getInvertedImageHtml(currentImage) }}
								style={{ flex: 1, backgroundColor: 'transparent' }}
								scrollEnabled={false}
							/>
						)}
						<TouchableOpacity
							onPress={() => setShowSchema(false)}
							className='absolute top-2 right-2 bg-black/80 p-2 rounded-full z-10'>
							<Feather name='x' size={20} color='#fff' />
						</TouchableOpacity>
					</View>
				) : (
					<ScrollView className='flex-1 mt-8 mb-4' showsVerticalScrollIndicator={false}>
						<View className='flex-row flex-wrap justify-between gap-y-4'>
							{AVAILABLE_FILES.map((file) => {
								const isThisFileDownloading =
									isDownloading && downloadingFileId === file.id;
								return (
									<TouchableOpacity
										key={file.id}
										onPress={() => handleFileGridPress(file)}
										disabled={isDownloading}
										className='bg-[#111] rounded-2xl p-6 items-center w-[48%] aspect-square justify-center relative'>
										{isThisFileDownloading ? (
											<ActivityIndicator size='large' color={file.color} />
										) : (
											<MaterialCommunityIcons
												name={file.icon as any}
												size={70}
												color={file.color}
											/>
										)}
										<Text
											className='text-white text-xs font-bold mt-4 text-center'
											numberOfLines={2}>
											{file.name}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>
					</ScrollView>
				)}

				{!selectedPdf && !showSchema && <View className='flex-1' />}

				{/* Bottom Bar: Chat / Mic Controls */}
				<View className='items-center'>
					<View className='flex-row w-full justify-around items-center mb-4'>
						<TouchableOpacity className='bg-[#111] p-5 rounded-2xl'>
							<Feather name='camera' size={24} color='#9ca3af' />
						</TouchableOpacity>

						<Animated.View style={{ transform: [{ scale: soundLevelAnim || 1 }] }}>
							<TouchableOpacity
								onPress={onMicPress}
								className={`border-2 border-[#d35400] p-6 rounded-3xl ${isListening ? 'bg-[#3a1a00]' : 'bg-[#1a0f00]'}`}>
								<MaterialCommunityIcons
									name='microphone'
									size={48}
									color='#d35400'
								/>
							</TouchableOpacity>
						</Animated.View>

						<TouchableOpacity className='bg-[#111] p-5 rounded-2xl'>
							<Feather name='search' size={24} color='#9ca3af' />
						</TouchableOpacity>
					</View>

					<Text className='text-[#d35400] text-xs font-bold uppercase tracking-widest mt-2'>
						{isListening ? 'ASYSTENT SŁUCHA' : 'ASYSTENT GOTOWY'}
					</Text>
				</View>
			</View>
		);
	}

	// --- DESKTOP / TABLET VIEW ---
	return (
		<View className='flex-1 h-full flex-col pl-6'>
			{/* Top Toolbar */}
			<View className='w-full flex-row items-center mb-4 h-14'>
				<View className='flex-1' />
				<View className='flex-1 flex-row justify-end gap-3'>
					<TouchableOpacity
						onPress={() => {
							if (downloadResumableRef.current) {
								downloadResumableRef.current.cancelAsync();
							}
							onSelectPdf(null);
							setShowSchema(false);
							setCurrentImage(null);
							setIsDownloading(false);
							setDownloadingFileId(null);
						}}
						disabled={isDownloading}
						className={`flex-row items-center border ${isDownloading ? 'border-neutral-700' : 'border-[#CC5500]'} px-4 py-3 rounded-md bg-[#0a0a0a]`}>
						<MaterialCommunityIcons
							name='file-tree'
							size={18}
							color={isDownloading ? '#555' : '#CC5500'}
						/>
						<Text
							className={`${isDownloading ? 'text-neutral-600' : 'text-[#CC5500]'} font-bold ml-2 tracking-widest text-[11px] uppercase`}>
							POKAŻ PLIKI
						</Text>
					</TouchableOpacity>

					{renderSourceButton()}
				</View>
			</View>

			{/* Main Content View */}
			<View className='flex-1 rounded-xl overflow-hidden bg-black'>
				{currentImage && showSchema ? (
					Platform.OS === 'web' ? (
						<View
							style={{
								flex: 1,
								backgroundColor: '#000',
								justifyContent: 'center',
								alignItems: 'center',
							}}>
							<img
								src={currentImage}
								style={{
									width: '100%',
									height: '100%',
									objectFit: 'contain',
									filter: 'invert(100%)',
								}}
								alt='Schemat'
							/>
						</View>
					) : (
						<WebView
							source={{ html: getInvertedImageHtml(currentImage) }}
							style={{ flex: 1, backgroundColor: 'transparent' }}
							scrollEnabled={false}
						/>
					)
				) : (currentImage && !showSchema) || selectedPdf ? (
					<View className='flex-1 relative'>
						<PdfViewer
							source={selectedPdf?.source || require('../assets/instrukcje.pdf')}
							page={selectedPdf?.page || 1}
						/>
						<View className='absolute top-0 left-0 bg-[#121212] border border-neutral-800 px-3 py-2 rounded-br-lg flex-row items-center shadow-lg opacity-90 z-10'>
							<MaterialCommunityIcons
								name={(selectedPdf?.icon as any) || 'file-pdf-box'}
								size={18}
								color={selectedPdf?.color || '#EF4444'}
							/>
							<Text className='text-slate-200 text-[11px] font-bold ml-2 tracking-widest uppercase'>
								{selectedPdf?.name || 'Dokument.pdf'}
							</Text>
						</View>
					</View>
				) : (
					<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
						<View className='flex-row flex-wrap justify-center gap-4 px-4'>
							{AVAILABLE_FILES.map((file) => {
								const isThisFileDownloading =
									isDownloading && downloadingFileId === file.id;

								return (
									<TouchableOpacity
										key={file.id}
										onPress={() => handleFileGridPress(file)}
										disabled={isDownloading}
										className='w-[30%] border rounded-2xl items-center justify-center py-6 px-3 bg-[#121212] border-neutral-800 relative'>
										{isThisFileDownloading && (
											<Text className='absolute top-2 text-[#CC5500] font-bold text-[9px] tracking-widest uppercase'>
												POBIERANIE...
											</Text>
										)}

										<View className='w-24 h-24 items-center justify-center relative'>
											<MaterialCommunityIcons
												name={file.icon as any}
												size={64}
												color={file.color}
												style={{ opacity: 0.2 }}
											/>
											<View className='absolute inset-0 items-center justify-center'>
												{isThisFileDownloading ? (
													<ActivityIndicator size='large' color='#fff' />
												) : (
													<Feather
														name='download-cloud'
														size={32}
														color='#fff'
													/>
												)}
											</View>
										</View>

										<Text
											className='font-bold mt-4 text-[13px] text-center leading-4 text-neutral-500'
											numberOfLines={2}>
											{file.name}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>
					</ScrollView>
				)}
			</View>
		</View>
	);
}
