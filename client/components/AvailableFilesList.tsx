import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import type { AvailableFile } from '@/types/chat';

const PRIMARY_ORANGE = '#FF7A00';

type AvailableFilesListProps = {
	files: AvailableFile[];
	variant: 'grid' | 'list';
	isLoading?: boolean;
	isFileDownloading?: boolean;
	downloadingFileId?: number | null;
	downloadedFileIds?: Set<number>;
	showTitle?: boolean;
	scrollable?: boolean;
	onOpenFile: (file: AvailableFile) => void;
	onDeleteDownloadedFile?: (file: AvailableFile) => void;
};

export default function AvailableFilesList({
	files,
	variant,
	isLoading = false,
	isFileDownloading = false,
	downloadingFileId = null,
	downloadedFileIds = new Set(),
	showTitle = true,
	scrollable = variant === 'grid',
	onOpenFile,
	onDeleteDownloadedFile,
}: AvailableFilesListProps) {
	const title = showTitle ? (
		<Text
			className='text-[#FF7A00] font-bold tracking-widest'
			style={{
				fontSize: variant === 'grid' ? 13 : 12,
				marginBottom: variant === 'grid' ? 20 : 12,
			}}>
			WSZYSTKIE PLIKI
		</Text>
	) : null;

	if (isLoading) {
		return (
			<>
				{title}
				<View className='flex-1 items-center justify-center'>
					<ActivityIndicator size='large' color={PRIMARY_ORANGE} />
					<Text className='text-[#AEB3BA] text-[13px] tracking-wide'>
						Ładowanie plików...
					</Text>
				</View>
			</>
		);
	}

	if (files.length === 0) {
		return (
			<>
				{title}
				<View className='flex-1 items-center justify-center px-4'>
					<Text className='text-[#AEB3BA] text-[13px] text-center'>
						Brak plików do wyświetlenia.
					</Text>
				</View>
			</>
		);
	}

	const items =
		variant === 'grid' ? (
			<View className='flex-row flex-wrap justify-center gap-4'>
				{files.map((file) => {
					const isThisFileDownloading =
						isFileDownloading && downloadingFileId === file.id;
					const isDownloaded = downloadedFileIds.has(file.id);

					return (
						<TouchableOpacity
							key={file.id}
							onPress={() => onOpenFile(file)}
							disabled={isFileDownloading}
							className='w-[30%] aspect-square py-5 px-3 border rounded-2xl items-center justify-center bg-[#141418] border-[#26262C] relative'>
							{isDownloaded && onDeleteDownloadedFile ? (
								<TouchableOpacity
									onPress={() => onDeleteDownloadedFile(file)}
									disabled={isFileDownloading}
									className='absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 border border-white/15 items-center justify-center z-10'>
									<Feather name='x' size={16} color='#C9CDD3' />
								</TouchableOpacity>
							) : null}

							<View className='w-20 h-20 items-center justify-center relative'>
								<MaterialCommunityIcons
									name={file.icon as any}
									size={56}
									color={file.color}
									style={{ opacity: isDownloaded ? 1 : 0.2 }}
								/>
								{isDownloaded ? null : (
									<View className='absolute inset-0 items-center justify-center'>
										{isThisFileDownloading ? (
											<ActivityIndicator size='large' color='#FFFFFF' />
										) : (
											<Feather
												name='download-cloud'
												size={28}
												color='#FFFFFF'
											/>
										)}
									</View>
								)}
							</View>

							<Text
								className='text-[13px] mt-4 leading-4 font-semibold text-center text-[#C9CDD3]'
								numberOfLines={2}>
								{file.name}
							</Text>
						</TouchableOpacity>
					);
				})}
			</View>
		) : (
			<>
				{files.map((file) => (
					<TouchableOpacity
						key={file.id}
						onPress={() => onOpenFile(file)}
						className='flex-row items-center rounded-xl border border-white/10 bg-[#18181C] px-4 py-4 mb-3'>
						<MaterialCommunityIcons
							name={file.icon as any}
							size={24}
							color={file.color}
						/>
						<Text className='text-[#D8DCE2] text-[14px] ml-3 flex-1'>{file.name}</Text>
					</TouchableOpacity>
				))}
			</>
		);

	return (
		<>
			{title}
			{scrollable ? (
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: variant === 'grid' ? 24 : 20 }}>
					{items}
				</ScrollView>
			) : (
				items
			)}
		</>
	);
}
