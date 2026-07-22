import { Link } from '@tanstack/react-router'
import { Calendar, FileStack, Plus, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useAttachmentDevices, useAttachments } from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import {
	DOCUMENT_CATEGORY_BADGE_CLASSES,
	DOCUMENT_CATEGORY_ICON_CLASSES,
	getDocumentCategory,
	type DocumentCategory,
} from '@/lib/documentCategory'
import type { Attachment } from '@/lib/types'

function DocumentRow({ attachment }: { attachment: Attachment }) {
	const { data: devices } = useAttachmentDevices(attachment.id)
	const category = getDocumentCategory(attachment.original_filename)
	const assigned = (devices?.length ?? 0) > 0

	return (
		<Link
			to="/documents/$attachmentId"
			params={{ attachmentId: String(attachment.id) }}
			className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0 hover:bg-panel-soft"
		>
			<span className="flex items-center gap-3 truncate text-cream">
				<span
					className={`flex size-8 shrink-0 items-center justify-center rounded-md ${DOCUMENT_CATEGORY_ICON_CLASSES[category]}`}
				>
					{category === 'Kody błędów' ? <ShieldAlert size={16} /> : <FileStack size={16} />}
				</span>
				<span className="truncate">{attachment.original_filename}</span>
			</span>
			<span>
				<span
					className={`rounded-md px-2 py-0.5 text-xs font-semibold ${DOCUMENT_CATEGORY_BADGE_CLASSES[category]}`}
				>
					{category}
				</span>
			</span>
			<span className="truncate text-xs text-cream/60">
				{devices === undefined
					? '…'
					: devices.length === 0
						? 'Brak przypisanych maszyn'
						: devices.length === 1
							? devices[0].name
							: `${devices.length} podłączonych maszyn`}
			</span>
			<span className="flex items-center gap-1.5 text-xs">
				<span className={`inline-block size-1.5 rounded-full ${assigned ? 'bg-emerald-400' : 'bg-amber-400'}`} />
				<span className={assigned ? 'text-emerald-300' : 'text-amber-300'}>
					{assigned ? 'Gotowy' : 'Oczekuje'}
				</span>
			</span>
			<span className="flex items-center gap-1.5 text-xs text-cream/50">
				<Calendar size={12} className="text-ember" />
				{new Date(attachment.created_at).toLocaleDateString('pl-PL')}
			</span>
		</Link>
	)
}

export function DocumentsPage() {
	const { data: attachments, isLoading } = useAttachments()
	const { data: devices } = useDevices()
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState<DocumentCategory | 'all'>('all')

	const filtered = useMemo(() => {
		if (!attachments) return []
		return attachments.filter((a) => {
			const matchesSearch = a.original_filename.toLowerCase().includes(search.toLowerCase())
			const matchesCategory = category === 'all' || getDocumentCategory(a.original_filename) === category
			return matchesSearch && matchesCategory
		})
	}, [attachments, search, category])

	const readyCount = attachments?.length ?? 0
	const unassignedCount = 0

	return (
		<div>
			<PageHeader
				title="Baza wiedzy"
				subtitle="Dokumenty, z których korzysta Asystent Serwisanta."
				meta={
					<>
						{attachments?.length ?? 0} plików · {devices?.length ?? 0} maszyn
					</>
				}
			/>

			<div className="mb-6 grid grid-cols-4 gap-4">
				<StatTile label="Dokumenty" value={attachments?.length ?? 0} sublabel="plików w bazie" icon={FileStack} color="blue" />
				<StatTile label="Gotowe do użycia" value={readyCount} sublabel="dostępne dla asystenta" icon={ShieldCheck} color="green" />
				<StatTile label="Wymagają uwagi" value={0} sublabel="błędów importu" icon={ShieldAlert} color="orange" />
				<StatTile label="Nieprzypisane" value={unassignedCount} sublabel="bez modelu" icon={FileStack} color="red" />
			</div>

			<div className="mb-6 flex items-center justify-between">
				<div>
					<h2 className="text-xl font-bold text-cream">Dokumenty</h2>
					<p className="mt-1 text-sm text-cream/50">Lista plików dostępnych dla Asystenta Serwisanta.</p>
				</div>
				<Link
					to="/add-document"
					className="flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink"
				>
					<Plus size={16} />
					Dodaj dokument
				</Link>
			</div>

			<div className="mb-4 flex gap-3">
				<div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
					<Search size={16} className="text-cream/40" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Szukaj po nazwie, modelu, typie…"
						className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
					/>
				</div>
				<select
					value={category}
					onChange={(e) => setCategory(e.target.value as DocumentCategory | 'all')}
					className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream"
				>
					<option value="all">Typ: wszystkie</option>
					<option value="Instrukcja">Instrukcja</option>
					<option value="Kody błędów">Kody błędów</option>
					<option value="Schemat">Schemat</option>
					<option value="Biuletyn">Biuletyn</option>
					<option value="Dokument">Dokument</option>
				</select>
				<select className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream">
					<option>Status: wszystkie</option>
					<option>Gotowy</option>
					<option>Oczekuje</option>
				</select>
				<select className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream">
					<option>Model: wszystkie</option>
					{devices?.map((d) => (
						<option key={d.id}>{d.name}</option>
					))}
				</select>
			</div>

			<div className="rounded-lg border border-line bg-panel">
				<div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40">
					<span>Dokument</span>
					<span>Typ</span>
					<span>Powiązane maszyny</span>
					<span>Stan importu</span>
					<span>Dodano</span>
				</div>
				{isLoading && <div className="px-4 py-6 text-sm text-cream/50">Ładowanie…</div>}
				{!isLoading && filtered.length === 0 && (
					<div className="px-4 py-6 text-sm text-cream/50">Brak dokumentów.</div>
				)}
				{filtered.map((attachment) => (
					<DocumentRow key={attachment.id} attachment={attachment} />
				))}
			</div>
		</div>
	)
}
