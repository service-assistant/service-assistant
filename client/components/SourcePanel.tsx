import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import AvailableFilesList from '@/components/AvailableFilesList';
import PdfViewer from '@/components/PdfViewer';
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
};

export default function SourcePanel({
	showSourcePanel,
	sourcePanelPdf,
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
}: SourcePanelProps) {
	if (!showSourcePanel) return null;

	const title = sourcePanelPdf ? 'ŹRÓDŁO ODPOWIEDZI' : 'WSZYSTKIE PLIKI';
	const headerSafeTop = fullScreen ? topInset : 0;
	const resolvedHeaderHeight = headerHeight ?? (fullScreen ? 64 + headerSafeTop : 76);
	const resolvedHeaderPaddingTop = headerPaddingTop ?? headerSafeTop;
	const resolvedHeaderTitleFontSize = headerTitleFontSize ?? (fullScreen ? 16 : 20);
	const resolvedHeaderTitleLineHeight = headerTitleLineHeight ?? resolvedHeaderTitleFontSize + 5;
	const content = sourcePanelPdf ? (
		<View className='flex-1 bg-black pt-3 pb-6 border-t border-white/10'>
			<View className='flex-1 overflow-hidden bg-black'>
				<PdfViewer
					source={sourcePanelPdf.source}
					page={sourcePanelPdf.page || 1}
					preserveTop
					onError={onPdfError}
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
			/>
		</View>
	);

	return (
		<View className='absolute inset-0 flex-row' style={{ zIndex: 50, elevation: 50 }}>
			{fullScreen ? null : (
				<TouchableOpacity
					activeOpacity={1}
					onPress={onClose}
					style={{ width: '40%', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
				/>
			)}
			<View
				className={`relative bg-[#07080A] ${fullScreen ? '' : 'border-l border-white/10'}`}
				style={{
					width: fullScreen ? '100%' : '60%',
					shadowColor: '#000000',
					shadowOpacity: 0.35,
					shadowRadius: 24,
					shadowOffset: { width: -10, height: 0 },
				}}>
				<View
					className='flex-row items-center px-4 bg-[#0D0D0D] border-b border-[#1F1F1F]'
					style={{
						height: resolvedHeaderHeight,
						paddingTop: resolvedHeaderPaddingTop,
					}}>
					<TouchableOpacity
						onPress={onClose}
						accessibilityRole='button'
						accessibilityLabel='Wstecz'
						className='border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D] items-center justify-center'
						style={{
							width: backButtonSize,
							height: backButtonSize,
							zIndex: 2,
							elevation: 2,
						}}>
						<Feather name='arrow-left' size={backIconSize} color='#FF7A00' />
					</TouchableOpacity>
					<Text
						className='flex-1 text-center text-white font-bold'
						style={{
							fontSize: resolvedHeaderTitleFontSize,
							lineHeight: resolvedHeaderTitleLineHeight,
						}}
						numberOfLines={1}>
						{title}
					</Text>
					<View style={{ width: backButtonSize, height: backButtonSize }} />
				</View>
				{content}
				{sourcePanelPdf ? (
					<View
						className='absolute bottom-4 left-4 h-11 rounded-full bg-black/85 border border-white/15 px-4 justify-center'
						style={{ zIndex: 2, elevation: 2, maxWidth: '72%' }}>
						<Text
							className='text-[#D8DCE2] text-[12px] font-bold tracking-widest uppercase'
							numberOfLines={1}>
							{sourcePanelPdf.name || 'Dokument.pdf'}
						</Text>
					</View>
				) : null}
			</View>
		</View>
	);
}
