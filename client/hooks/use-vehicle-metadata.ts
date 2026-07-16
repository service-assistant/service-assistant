import { useEffect, useState } from 'react';

import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import { fetchWithRetry, HttpError } from '@/utils/network';

export type Brand = {
	id: number;
	name: string;
	logo_url: string;
	created_at: string;
	updated_at: string;
};

export type DeviceType = {
	id: number;
	name: string;
	created_at: string;
	updated_at: string;
};

export type DeviceRaw = {
	id: number;
	brand_id: number;
	device_type_id: number;
	name: string;
	model_serial_code: string;
	image_url: string;
	created_at: string;
	updated_at: string;
};

type UseVehicleMetadataParams = {
	onServiceError: (featureName: string, error: unknown) => void;
	refreshKey?: number;
};

export const useVehicleMetadata = ({
	onServiceError,
	refreshKey = 0,
}: UseVehicleMetadataParams) => {
	const [brands, setBrands] = useState<Brand[]>([]);
	const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
	const [rawDevices, setRawDevices] = useState<DeviceRaw[]>([]);
	const [isLoadingBrands, setIsLoadingBrands] = useState(true);
	const [isLoadingTypes, setIsLoadingTypes] = useState(true);
	const [isLoadingDevices, setIsLoadingDevices] = useState(true);

	useEffect(() => {
		const fetchBrands = async () => {
			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = getAuthTokenOrThrow();
				const response = await fetchWithRetry(`${AUTH_URL}/api/brands`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`,
						Accept: 'application/json',
					},
				});
				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new HttpError(response.status, `Brands API error: ${response.status}`);
				}
				const data: Brand[] = await response.json();
				setBrands(data);
			} catch (error) {
				console.log('Handled brands load error:', error);
				onServiceError(getServiceErrorFeature(error, 'lista marek'), error);
			} finally {
				setIsLoadingBrands(false);
			}
		};

		const fetchDeviceTypes = async () => {
			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = getAuthTokenOrThrow();
				const response = await fetchWithRetry(`${AUTH_URL}/api/device_types`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`,
						Accept: 'application/json',
					},
				});
				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new HttpError(response.status, `Types API error: ${response.status}`);
				}
				const data: DeviceType[] = await response.json();
				setDeviceTypes(data);
			} catch (error) {
				console.log('Handled device types load error:', error);
				onServiceError(getServiceErrorFeature(error, 'lista typów urządzeń'), error);
			} finally {
				setIsLoadingTypes(false);
			}
		};

		const fetchDevices = async () => {
			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = getAuthTokenOrThrow();
				const response = await fetchWithRetry(`${AUTH_URL}/api/devices`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${authToken}`,
						Accept: 'application/json',
					},
				});
				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new HttpError(response.status, `Devices API error: ${response.status}`);
				}
				const data: DeviceRaw[] = await response.json();
				setRawDevices(data);
			} catch (error) {
				console.log('Handled devices load error:', error);
				onServiceError(getServiceErrorFeature(error, 'lista maszyn'), error);
			} finally {
				setIsLoadingDevices(false);
			}
		};

		fetchBrands();
		fetchDeviceTypes();
		fetchDevices();
	}, [onServiceError, refreshKey]);

	return {
		brands,
		deviceTypes,
		rawDevices,
		isLoadingBrands,
		isLoadingTypes,
		isLoadingDevices,
	};
};
