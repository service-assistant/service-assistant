import { MachineSelectionTree } from '@/components/MachineSelectionTree'
import {
	useAttachment,
	useAttachmentDevices,
	useLinkDevice,
	useUnlinkDevice,
} from '@/hooks/useAttachments'
import { useCategoryTree } from '@/hooks/useCategories'
import { useDevices } from '@/hooks/useDevices'
import { machineCountLabel } from '@/lib/pluralize'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import './AddDocumentPage.css'
import './DocumentMachinesPage.css'

export function DocumentMachinesPage() {
	const { attachmentId } = useParams({ strict: false }) as { attachmentId: string }
	const id = Number(attachmentId)
	const navigate = useNavigate()
	const { data: attachment, isLoading: attachmentLoading } = useAttachment(id)
	const { data: linkedDevices, isLoading: linkedLoading } = useAttachmentDevices(id)
	const { data: devices, isLoading: devicesLoading } = useDevices()
	const { data: tree } = useCategoryTree()
	const linkDevice = useLinkDevice()
	const unlinkDevice = useUnlinkDevice()
	const [search, setSearch] = useState('')
	const [selectedIds, setSelectedIds] = useState<number[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const initialIds = useMemo(
		() => linkedDevices?.map((device) => device.id) ?? [],
		[linkedDevices],
	)
	const currentSelectedIds = selectedIds ?? initialIds
	const pending = linkDevice.isPending || unlinkDevice.isPending
	const loading = attachmentLoading || linkedLoading || devicesLoading

	function goBack() {
		void navigate({
			to: '/documents/$attachmentId',
			params: { attachmentId: String(id) },
		})
	}

	async function save() {
		const original = new Set(initialIds)
		const selected = new Set(currentSelectedIds)
		try {
			setError(null)
			await Promise.all([
				...currentSelectedIds
					.filter((deviceId) => !original.has(deviceId))
					.map((deviceId) => linkDevice.mutateAsync({ attachmentId: id, deviceId })),
				...initialIds
					.filter((deviceId) => !selected.has(deviceId))
					.map((deviceId) => unlinkDevice.mutateAsync({ attachmentId: id, deviceId })),
			])
			goBack()
		} catch (saveError) {
			setError(
				saveError instanceof Error
					? saveError.message
					: 'Nie udało się zapisać przypisanych maszyn.',
			)
		}
	}

	return (
		<div className='add-document-page document-machines-page'>
			<div className='document-wizard-content document-machines-content'>
				<button type='button' className='document-machines-back' onClick={goBack}>
					<ArrowLeft size={17} /> Wróć do szczegółów dokumentu
				</button>
				<header className='document-heading'>
					<h1>Wybór maszyn</h1>
					<p>
						Wybierz maszyny, do których ma być przypisany dokument
						{attachment ? ` „${attachment.original_filename}”` : ''}.
					</p>
				</header>

				{loading ? (
					<div className='document-machines-loading'>Ładowanie maszyn…</div>
				) : !attachment ? (
					<div className='document-machines-loading'>
						Nie udało się załadować dokumentu.
					</div>
				) : (
					<>
						<div className='document-machine-toolbar'>
							<Search size={18} />
							<input
								autoFocus
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder='Szukaj po maszynie, katalogu, numerze…'
							/>
						</div>
						<MachineSelectionTree
							devices={devices ?? []}
							onSelectionChange={setSelectedIds}
							search={search}
							selectedIds={currentSelectedIds}
							tree={tree ?? []}
						/>
					</>
				)}
				{error && <p className='document-error'>{error}</p>}
			</div>

			<footer className='document-wizard-footer'>
				<button
					type='button'
					className='document-secondary-button'
					disabled={pending}
					onClick={goBack}>
					Anuluj
				</button>
				<span className='document-footer-status'>
					Wybrano: {machineCountLabel(currentSelectedIds.length)}
				</span>
				<button
					type='button'
					className='document-primary-button'
					disabled={pending || loading || !attachment}
					onClick={() => void save()}>
					{pending ? 'Zapisywanie…' : 'Zapisz zmiany'}
				</button>
			</footer>
		</div>
	)
}
