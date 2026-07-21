import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useBrands } from '@/hooks/useBrands'
import { useDeviceTypes } from '@/hooks/useDeviceTypes'
import { useDevices } from '@/hooks/useDevices'

type Tab = 'models' | 'brands' | 'types'

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			className={`rounded-md px-4 py-2 text-sm ${active ? 'bg-ember text-ink' : 'text-cream/60 hover:bg-panel-soft'}`}
		>
			{label}
		</button>
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
			<div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
				<Search size={16} className="text-cream/40" />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Szukaj modelu…"
					className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
				/>
			</div>
			<div className="rounded-lg border border-line bg-panel">
				<div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40">
					<span>Model</span>
					<span>Marka</span>
					<span>Typ</span>
					<span>Kod</span>
				</div>
				{isLoading && <div className="px-4 py-6 text-sm text-cream/50">Ładowanie…</div>}
				{filtered.map((device) => (
					<Link
						key={device.id}
						to="/machines/$deviceId"
						params={{ deviceId: String(device.id) }}
						className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft"
					>
						<span className="text-cream">{device.name}</span>
						<span>{brandMap.get(device.brand_id) ?? '?'}</span>
						<span>{typeMap.get(device.device_type_id) ?? '?'}</span>
						<span className="text-xs text-cream/50">{device.model_serial_code ?? '—'}</span>
					</Link>
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
			<div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
				<Search size={16} className="text-cream/40" />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Szukaj marki…"
					className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
				/>
			</div>
			<div className="rounded-lg border border-line bg-panel">
				<div className="grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40">
					<span>Marka</span>
					<span>Liczba modeli</span>
				</div>
				{isLoading && <div className="px-4 py-6 text-sm text-cream/50">Ładowanie…</div>}
				{filtered.map((brand) => (
					<Link
						key={brand.id}
						to="/brands/$brandId"
						params={{ brandId: String(brand.id) }}
						className="grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft"
					>
						<span className="flex items-center gap-2 text-cream">
							{brand.logo_url && <img src={brand.logo_url} alt="" className="size-6 rounded object-contain" />}
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
			<div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
				<Search size={16} className="text-cream/40" />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Szukaj typu…"
					className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
				/>
			</div>
			<div className="rounded-lg border border-line bg-panel">
				<div className="grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40">
					<span>Typ maszyny</span>
					<span>Liczba modeli</span>
				</div>
				{isLoading && <div className="px-4 py-6 text-sm text-cream/50">Ładowanie…</div>}
				{filtered.map((type) => (
					<Link
						key={type.id}
						to="/machine-types/$deviceTypeId"
						params={{ deviceTypeId: String(type.id) }}
						className="grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft"
					>
						<span className="text-cream">{type.name}</span>
						<span>{devices?.filter((d) => d.device_type_id === type.id).length ?? 0}</span>
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

	function setTab(t: Tab) {
		void navigate({ to: '/catalog', search: { tab: t } })
	}

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-cream">Katalog maszyn</h1>
				<div className="flex gap-2">
					{activeTab === 'models' && (
						<Link to="/add-machine" className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink">
							Dodaj maszynę
						</Link>
					)}
					{activeTab === 'brands' && (
						<Link to="/brands/new" className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink">
							Dodaj markę
						</Link>
					)}
					{activeTab === 'types' && (
						<Link
							to="/machine-types/new"
							className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink"
						>
							Dodaj typ
						</Link>
					)}
				</div>
			</div>

			<div className="mb-4 flex gap-2 rounded-md border border-line bg-panel p-1">
				<TabButton label="Modele" active={activeTab === 'models'} onClick={() => setTab('models')} />
				<TabButton label="Marki" active={activeTab === 'brands'} onClick={() => setTab('brands')} />
				<TabButton label="Typy maszyn" active={activeTab === 'types'} onClick={() => setTab('types')} />
			</div>

			{activeTab === 'models' && <ModelsTab />}
			{activeTab === 'brands' && <BrandsTab />}
			{activeTab === 'types' && <TypesTab />}
		</div>
	)
}
