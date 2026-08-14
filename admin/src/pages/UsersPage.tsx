const MOCK_TECHNICIANS = [
	{ name: 'Marek Kowalski', role: 'Serwisant', online: true, lastActive: 'teraz' },
	{ name: 'Anna Nowak', role: 'Serwisant', online: false, lastActive: '2 godz. temu' },
	{ name: 'Piotr Wiśniewski', role: 'Kierownik serwisu', online: true, lastActive: 'teraz' },
]

export function UsersPage() {
	return (
		<div>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Użytkownicy</h1>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Serwisant</span>
					<span>Rola</span>
					<span>Status</span>
					<span>Ostatnia aktywność</span>
				</div>
				{MOCK_TECHNICIANS.map((tech) => (
					<div
						key={tech.name}
						className='grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80'>
						<span className='text-cream'>{tech.name}</span>
						<span>{tech.role}</span>
						<span className={tech.online ? 'text-emerald-300' : 'text-cream/50'}>
							{tech.online ? 'Online' : 'Offline'}
						</span>
						<span className='text-xs text-cream/50'>{tech.lastActive}</span>
					</div>
				))}
			</div>
		</div>
	)
}
