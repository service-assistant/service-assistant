import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import AvailableFilesList from '@/components/documents/AvailableFilesList';
import PdfViewer from '@/components/documents/PdfViewer';
import type { AvailableFile } from '@/types/chat';

export type SourcePanelPdf = {
	name?: string;
	icon?: string;
	color?: string;
	source: any;
	page?: number;
};

type SourcePanelProps = {
	showSourcePanel: boolean;
	sourcePanelPdf: SourcePanelPdf | null;
	embedded?: boolean;
	fullScreen?: boolean;
	topInset?: number;
	fileGridColumns?: 2 | 3;
	headerHeight?: number;
	headerPaddingTop?: number;
	headerTitleFontSize?: number;
	headerTitleLineHeight?: number;
	backButtonSize?: number;
	backIconSize?: number;
	isAvailableFilesLoading: boolean;
	availableFiles: AvailableFile[];
	isFileDownloading: boolean;
	downloadingFileId: number | null;
	downloadedFileIds: Set<number>;
	onOpenFile: (file: AvailableFile) => void;
	onDeleteDownloadedFile: (file: AvailableFile) => void;
	onPdfError?: (error: unknown) => void;
	onClose: () => void;
	lightMode?: boolean;
};

export default function SourcePanel({
	showSourcePanel,
	sourcePanelPdf,
	embedded = false,
	fullScreen = false,
	topInset = 0,
	fileGridColumns = fullScreen ? 2 : 3,
	headerHeight,
	headerPaddingTop,
	headerTitleFontSize,
	headerTitleLineHeight,
	backButtonSize = fullScreen ? 42 : 48,
	backIconSize = fullScreen ? 21 : 23,
	isAvailableFilesLoading,
	availableFiles,
	isFileDownloading,
	downloadingFileId,
	downloadedFileIds,
	onOpenFile,
	onDeleteDownloadedFile,
	onPdfError,
	onClose,
	lightMode = false,
}: SourcePanelProps) {
	if (!showSourcePanel) return null;

	const title = sourcePanelPdf ? 'ŹRÓDŁO ODPOWIEDZI' : 'WSZYSTKIE PLIKI';
	const headerSafeTop = fullScreen ? topInset : 0;
	const resolvedHeaderHeight = headerHeight ?? (fullScreen ? 64 + headerSafeTop : 76);
	const resolvedHeaderPaddingTop = headerPaddingTop ?? headerSafeTop;
	const resolvedHeaderTitleFontSize = headerTitleFontSize ?? (fullScreen ? 16 : 20);
	const resolvedHeaderTitleLineHeight = headerTitleLineHeight ?? resolvedHeaderTitleFontSize + 5;
	const content = sourcePanelPdf ? (
		<View
			className={`flex-1 pt-3 pb-6 border-t ${
				lightMode ? 'bg-white border-[#E4E4E7]' : 'bg-black border-white/10'
			}`}>
			<View className={`flex-1 overflow-hidden ${lightMode ? 'bg-white' : 'bg-black'}`}>
				<PdfViewer
					source={sourcePanelPdf.source}
					page={sourcePanelPdf.page ?? 1}
					preserveTop
					onError={onPdfError}
					lightMode={lightMode}
				/>
			</View>
		</View>
	) : (
		<View className={`flex-1 ${fullScreen ? 'px-4 pt-3 pb-5' : 'px-6 pt-4 pb-6'}`}>
			<AvailableFilesList
				files={availableFiles}
				variant='grid'
				showTitle={false}
				gridColumns={fileGridColumns}
				isLoading={isAvailableFilesLoading}
				isFileDownloading={isFileDownloading}
				downloadingFileId={downloadingFileId}
				downloadedFileIds={downloadedFileIds}
				onOpenFile={onOpenFile}
				onDeleteDownloadedFile={onDeleteDownloadedFile}
				lightMode={lightMode}
			/>
		</View>
	);

	return (
		<View
			className={embedded ? 'flex-1' : 'absolute inset-0 flex-row'}
			style={embedded ? { minWidth: 0 } : { zIndex: 50, elevation: 50 }}>
			{embedded || fullScreen ? null : (
				<TouchableOpacity
					activeOpacity={1}
					onPress={onClose}
					style={{ width: '40%', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
				/>
			)}
			<View
				className={`relative ${
					lightMode ? 'bg-[#F7F7F8]' : 'bg-[#07080A]'
				} ${fullScreen ? '' : lightMode ? 'border-l border-[#E4E4E7]' : 'border-l border-white/10'}`}
				style={{
					width: embedded || fullScreen ? '100%' : '60%',
					flex: embedded ? 1 : undefined,
					shadowColor: '#000000',
					shadowOpacity: embedded ? 0 : 0.35,
					shadowRadius: 24,
					shadowOffset: { width: -10, height: 0 },
				}}>
				{embedded ? (
					<TouchableOpacity
						onPress={onClose}
						accessibilityRole='button'
						accessibilityLabel='Wstecz'
						className={`absolute top-4 right-4 rounded-full border items-center justify-center ${
							lightMode
								? 'border-[#E4E4E7] bg-white/95'
								: 'border-white/15 bg-black/85'
						}`}
						style={{ width: 42, height: 42, zIndex: 5, elevation: 5 }}>
						<Feather name='x' size={22} color='#FF7A00' />
					</TouchableOpacity>
				) : (
					<View
						className={`flex-row items-center px-4 border-b ${
							lightMode
								? 'bg-white border-[#E4E4E7]'
								: 'bg-[#0D0D0D] border-[#1F1F1F]'
						}`}
						style={{
							height: resolvedHeaderHeight,
							paddingTop: resolvedHeaderPaddingTop,
						}}>
						<TouchableOpacity
							onPress={onClose}
							accessibilityRole='button'
							accessibilityLabel='Wstecz'
							className={`border rounded-[10px] items-center justify-center ${
								lightMode
									? 'border-[#E4E4E7] bg-white'
									: 'border-[#2A2A2A] bg-[#0D0D0D]'
							}`}
							style={{
								width: backButtonSize,
								height: backButtonSize,
								zIndex: 2,
								elevation: 2,
							}}>
							<Feather name='arrow-left' size={backIconSize} color='#FF7A00' />
						</TouchableOpacity>
						<Text
							className={`flex-1 text-center font-bold ${lightMode ? 'text-[#18181B]' : 'text-white'}`}
							style={{
								fontSize: resolvedHeaderTitleFontSize,
								lineHeight: resolvedHeaderTitleLineHeight,
							}}
							numberOfLines={1}>
							{title}
						</Text>
						<View style={{ width: backButtonSize, height: backButtonSize }} />
					</View>
				)}
				{content}
				{sourcePanelPdf ? (
					<View
						className={`absolute bottom-4 left-4 h-11 rounded-full border px-4 justify-center ${
							lightMode
								? 'bg-white/95 border-[#D4D4D8]'
								: 'bg-black/85 border-white/15'
						}`}
						style={{ zIndex: 2, elevation: 2, maxWidth: '72%' }}>
						<Text
							className={`${lightMode ? 'text-[#3F3F46]' : 'text-[#D8DCE2]'} text-[12px] font-bold tracking-widest uppercase`}
							numberOfLines={1}>
							{sourcePanelPdf.name || 'Dokument.pdf'}
						</Text>
					</View>
				) : null}
			</View>
		</View>
	);
}
