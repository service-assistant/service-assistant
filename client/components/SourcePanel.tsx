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

	const content = sourcePanelPdf ? (
		<View className='flex-1 bg-black pt-8 pb-6'>
			<View className='px-6'>
				<Text className='text-[#FF7A00] text-[13px] font-bold tracking-widest mb-5 pr-16'>
					ŹRÓDŁO ODPOWIEDZI
				</Text>
			</View>
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
		<View className='flex-1 px-6 pt-8 pb-6'>
			<AvailableFilesList
				files={availableFiles}
				variant='grid'
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
			<TouchableOpacity
				activeOpacity={1}
				onPress={onClose}
				style={{ width: '40%', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
			/>
			<View
				className='relative bg-[#07080A] border-l border-white/10'
				style={{
					width: '60%',
					shadowColor: '#000000',
					shadowOpacity: 0.35,
					shadowRadius: 24,
					shadowOffset: { width: -10, height: 0 },
				}}>
				{content}
				<TouchableOpacity
					onPress={onClose}
					className='absolute top-4 right-4 w-11 h-11 rounded-full bg-black/85 border border-white/15 items-center justify-center'
					style={{ zIndex: 2, elevation: 2 }}>
					<Feather name='x' size={22} color='#FFFFFF' />
				</TouchableOpacity>
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
