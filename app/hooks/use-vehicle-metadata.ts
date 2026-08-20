import { useEffect, useState } from 'react';

import { apiGetJson } from '@/lib/api-client';
import { API_URL_CONFIG_ERROR } from '@/utils/api-config';
import { getServiceErrorFeature } from '@/utils/auth-errors';

export type Category = {
	id: number;
	name: string;
	image_url: string | null;
	parent_id: number | null;
	created_at: string;
	updated_at: string;
	children: Category[];
};

export type DeviceRaw = {
	id: number;
	category_id: number | null;
	name: string;
	model_serial_code: string | null;
	image_url: string | null;
	created_at: string;
	updated_at: string;
};

type UseVehicleMetadataParams = {
	onServiceError: (featureName: string, error: unknown) => void;
	refreshKey?: number;
};

export const findCategoryPath = (categories: Category[], categoryId: number | null): Category[] => {
	if (categoryId === null) return [];
	for (const category of categories) {
		if (category.id === categoryId) return [category];
		const childPath = findCategoryPath(category.children, categoryId);
		if (childPath.length > 0) return [category, ...childPath];
	}
	return [];
};

export const categoryPathStartsWith = (path: Category[], selectedIds: number[]) =>
	selectedIds.every((id, index) => path[index]?.id === id);

export const useVehicleMetadata = ({
	onServiceError,
	refreshKey = 0,
}: UseVehicleMetadataParams) => {
	const [categories, setCategories] = useState<Category[]>([]);
	const [rawDevices, setRawDevices] = useState<DeviceRaw[]>([]);
	const [isLoadingCategories, setIsLoadingCategories] = useState(true);
	const [isLoadingDevices, setIsLoadingDevices] = useState(true);

	useEffect(() => {
		const fetchCategories = async () => {
			try {
				if (API_URL_CONFIG_ERROR) throw API_URL_CONFIG_ERROR;
				setCategories(await apiGetJson<Category[]>('/api/categories/tree'));
			} catch (error) {
				console.log('Handled categories load error:', error);
				onServiceError(getServiceErrorFeature(error, 'lista kategorii'), error);
			} finally {
				setIsLoadingCategories(false);
			}
		};

		const fetchDevices = async () => {
			try {
				if (API_URL_CONFIG_ERROR) throw API_URL_CONFIG_ERROR;
				setRawDevices(await apiGetJson<DeviceRaw[]>('/api/devices'));
			} catch (error) {
				console.log('Handled devices load error:', error);
				onServiceError(getServiceErrorFeature(error, 'lista maszyn'), error);
			} finally {
				setIsLoadingDevices(false);
			}
		};

		void fetchCategories();
		void fetchDevices();
	}, [onServiceError, refreshKey]);

	return { categories, rawDevices, isLoadingCategories, isLoadingDevices };
};
