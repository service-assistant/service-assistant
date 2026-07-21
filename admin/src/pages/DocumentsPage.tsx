import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAttachmentDevices, useAttachments } from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import { getDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'
import type { Attachment } from '@/lib/types'

function StatTile({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border border-line bg-panel px-4 py-3">
			<div className="text-2xl font-semibold text-cream">{value}</div>
			<div className="text-xs text-cream/50">{label}</div>
		</div>
	)
}

function DocumentRow({ attachment }: { attachment: Attachment }) {
	const { data: devices } = useAttachmentDevices(attachment.id)
	const category = getDocumentCategory(attachment.original_filename)
	const assigned = (devices?.length ?? 0) > 0

	return (
		<Link
			to="/documents/$attachmentId"
			params={{ attachmentId: String(attachment.id) }}
			className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 hover:bg-panel-soft"
		>
			<span className="truncate text-cream">{attachment.original_filename}</span>
			<span className="text-xs text-cream/60">{category}</span>
			<span className="truncate text-xs text-cream/60">
				{devices === undefined
					? '…'
					: devices.length === 0
						? '—'
						: devices.map((d) => d.name).join(', ')}
			</span>
			<span>
				<span
					className={`rounded-full px-2 py-0.5 text-xs ${assigned ? 'bg-emerald-400/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'}`}
				>
					{assigned ? 'Przypisany' : 'Nieprzypisany'}
				</span>
			</span>
			<span className="text-xs text-cream/50">
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

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-cream">Baza wiedzy</h1>
				<Link to="/add-document" className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink">
					Dodaj dokument
				</Link>
			</div>

			<div className="mb-6 grid grid-cols-4 gap-4">
				<StatTile label="Wszystkie dokumenty" value={attachments?.length ?? 0} />
				<StatTile label="Maszyny w katalogu" value={devices?.length ?? 0} />
				<StatTile
					label="Kategorie"
					value={new Set(attachments?.map((a) => getDocumentCategory(a.original_filename))).size}
				/>
				<StatTile label="Wyniki filtra" value={filtered.length} />
			</div>

			<div className="mb-4 flex gap-3">
				<div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
					<Search size={16} className="text-cream/40" />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Szukaj dokumentu…"
						className="w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40"
					/>
				</div>
				<select
					value={category}
					onChange={(e) => setCategory(e.target.value as DocumentCategory | 'all')}
					className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream"
				>
					<option value="all">Wszystkie kategorie</option>
					<option value="Instrukcja">Instrukcja</option>
					<option value="Kody błędów">Kody błędów</option>
					<option value="Schemat">Schemat</option>
					<option value="Biuletyn">Biuletyn</option>
					<option value="Dokument">Dokument</option>
				</select>
			</div>

			<div className="rounded-lg border border-line bg-panel">
				<div className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40">
					<span>Nazwa</span>
					<span>Kategoria</span>
					<span>Maszyny</span>
					<span>Status</span>
					<span>Data</span>
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
