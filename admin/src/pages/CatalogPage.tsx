import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useBrands } from '@/hooks/useBrands'
import { useDeviceTypes } from '@/hooks/useDeviceTypes'
import { useDeviceAttachments, useDevices } from '@/hooks/useDevices'
import type { Device } from '@/lib/types'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Layers, Plus, Search, ShieldAlert, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'

type Tab = 'models' | 'brands' | 'types'

function TabButton({
	label,
	active,
	onClick,
}: {
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={`rounded-md px-4 py-2 text-sm ${active ? 'bg-ember text-ink' : 'text-cream/60 hover:bg-panel-soft'}`}>
			{label}
		</button>
	)
}

function ModelRow({
	device,
	brandName,
	typeName,
}: {
	device: Device
	brandName: string
	typeName: string
}) {
	const { data: attachments } = useDeviceAttachments(device.id)
	const assigned = (attachments?.length ?? 0) > 0

	return (
		<Link
			to='/machines/$deviceId'
			params={{ deviceId: String(device.id) }}
			className='grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0 hover:bg-panel-soft'>
			<span className='flex items-center gap-3 text-cream'>
				{device.image_url ? (
					<img
						src={device.image_url}
						alt=''
						className='size-9 shrink-0 rounded-md object-cover'
					/>
				) : (
					<span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-panel-soft text-cream/30'>
						<Wrench size={16} />
					</span>
				)}
				<span>
					<div>{device.name}</div>
					{device.model_serial_code && (
						<div className='text-xs text-cream/40'>{device.model_serial_code}</div>
					)}
				</span>
			</span>
			<span>{brandName}</span>
			<span>{typeName}</span>
			<span className='text-xs text-cream/60'>
				{attachments === undefined
					? '…'
					: attachments.length === 0
						? '0 dokumentów'
						: `${attachments.length} dokumentów`}
			</span>
			<span className='flex items-center gap-1.5 text-xs'>
				<span
					className={`inline-block size-1.5 rounded-full ${assigned ? 'bg-emerald-400' : 'bg-rose-400'}`}
				/>
				<span className={assigned ? 'text-emerald-300' : 'text-rose-300'}>
					{assigned ? 'Przypisana' : 'Nieprzypisana'}
				</span>
			</span>
		</Link>
	)
}

function ModelsTab() {
	const { data: devices, isLoading } = useDevices()
	const { data: brands } = useBrands()
	const { data: deviceTypes } = useDeviceTypes()
	const [search, setSearch] = useState('')

	const brandMap = new Map(brands?.map((b) => [b.id, b.name]))
	const typeMap = new Map(deviceTypes?.map((t) => [t.id, t.name]))

	const filtered = useMemo(
		() => devices?.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) ?? [],
		[devices, search],
	)

	return (
		<div>
			<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
				<Search size={16} className='text-cream/40' />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Szukaj po nazwie modelu…'
					className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
				/>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Model</span>
					<span>Marka</span>
					<span>Typ</span>
					<span>Dokumenty</span>
					<span>Status</span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{filtered.map((device) => (
					<ModelRow
						key={device.id}
						device={device}
						brandName={brandMap.get(device.brand_id) ?? '?'}
						typeName={typeMap.get(device.device_type_id) ?? '?'}
					/>
				))}
			</div>
		</div>
	)
}

function BrandsTab() {
	const { data: brands, isLoading } = useBrands()
	const { data: devices } = useDevices()
	const [search, setSearch] = useState('')

	const filtered = useMemo(
		() => brands?.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())) ?? [],
		[brands, search],
	)

	return (
		<div>
			<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
				<Search size={16} className='text-cream/40' />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Szukaj marki…'
					className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
				/>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Marka</span>
					<span>Liczba modeli</span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{filtered.map((brand) => (
					<Link
						key={brand.id}
						to='/brands/$brandId'
						params={{ brandId: String(brand.id) }}
						className='grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft'>
						<span className='flex items-center gap-2 text-cream'>
							{brand.logo_url && (
								<img
									src={brand.logo_url}
									alt=''
									className='size-6 rounded object-contain'
								/>
							)}
							{brand.name}
						</span>
						<span>{devices?.filter((d) => d.brand_id === brand.id).length ?? 0}</span>
					</Link>
				))}
			</div>
		</div>
	)
}

function TypesTab() {
	const { data: deviceTypes, isLoading } = useDeviceTypes()
	const { data: devices } = useDevices()
	const [search, setSearch] = useState('')

	const filtered = useMemo(
		() => deviceTypes?.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) ?? [],
		[deviceTypes, search],
	)

	return (
		<div>
			<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
				<Search size={16} className='text-cream/40' />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Szukaj typu…'
					className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
				/>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Typ maszyny</span>
					<span>Liczba modeli</span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{filtered.map((type) => (
					<Link
						key={type.id}
						to='/machine-types/$deviceTypeId'
						params={{ deviceTypeId: String(type.id) }}
						className='grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft'>
						<span className='text-cream'>{type.name}</span>
						<span>
							{devices?.filter((d) => d.device_type_id === type.id).length ?? 0}
						</span>
					</Link>
				))}
			</div>
		</div>
	)
}

export function CatalogPage() {
	const { tab } = useSearch({ strict: false }) as { tab?: 'models' | 'brands' | 'types' }
	const navigate = useNavigate()
	const activeTab: Tab = tab ?? 'models'
	const { data: devices } = useDevices()
	const { data: brands } = useBrands()
	const { data: deviceTypes } = useDeviceTypes()

	function setTab(t: Tab) {
		void navigate({ to: '/catalog', search: { tab: t } })
	}

	return (
		<div>
			<PageHeader
				title='Katalog maszyn'
				subtitle='Zarządzaj markami, typami i modelami maszyn używanymi w dokumentach oraz asystencie.'
				meta={
					<>
						{brands?.length ?? 0} marek · {deviceTypes?.length ?? 0} typów ·{' '}
						{devices?.length ?? 0} modeli
					</>
				}
			/>

			<div className='mb-6 grid grid-cols-4 gap-4'>
				<StatTile
					label='Marki'
					value={brands?.length ?? 0}
					sublabel='aktywnych'
					icon={Layers}
					color='blue'
				/>
				<StatTile
					label='Typy maszyn'
					value={deviceTypes?.length ?? 0}
					sublabel='kategorie'
					icon={Layers}
					color='blue'
				/>
				<StatTile
					label='Modele'
					value={devices?.length ?? 0}
					sublabel='w katalogu'
					icon={Wrench}
					color='green'
				/>
				<StatTile
					label='Nieprzypisane'
					value={0}
					sublabel='wymagają uwagi'
					icon={ShieldAlert}
					color='red'
				/>
			</div>

			<div className='mb-6 flex items-center justify-between'>
				<h2 className='text-xl font-bold text-cream'>
					{activeTab === 'models'
						? 'Modele maszyn'
						: activeTab === 'brands'
							? 'Marki'
							: 'Typy maszyn'}
				</h2>
				<div className='flex gap-2'>
					{activeTab === 'models' && (
						<Link
							to='/add-machine'
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							<Plus size={16} />
							Dodaj maszynę
						</Link>
					)}
					{activeTab === 'brands' && (
						<Link
							to='/brands/new'
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							<Plus size={16} />
							Dodaj markę
						</Link>
					)}
					{activeTab === 'types' && (
						<Link
							to='/machine-types/new'
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							<Plus size={16} />
							Dodaj typ
						</Link>
					)}
				</div>
			</div>

			<div className='mb-4 flex gap-2 rounded-md border border-line bg-panel p-1'>
				<TabButton
					label='Modele maszyn'
					active={activeTab === 'models'}
					onClick={() => setTab('models')}
				/>
				<TabButton
					label='Marki'
					active={activeTab === 'brands'}
					onClick={() => setTab('brands')}
				/>
				<TabButton
					label='Typy maszyn'
					active={activeTab === 'types'}
					onClick={() => setTab('types')}
				/>
			</div>

			{activeTab === 'models' && <ModelsTab />}
			{activeTab === 'brands' && <BrandsTab />}
			{activeTab === 'types' && <TypesTab />}
		</div>
	)
}
