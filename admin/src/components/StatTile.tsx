import type { LucideIcon } from 'lucide-react'

const DOT_COLORS = {
	blue: 'bg-sky-400',
	green: 'bg-emerald-400',
	orange: 'bg-ember',
	red: 'bg-rose-400',
} as const

const ICON_COLORS = {
	blue: 'text-sky-400',
	green: 'text-emerald-400',
	orange: 'text-ember',
	red: 'text-rose-400',
} as const

export function StatTile({
	label,
	value,
	sublabel,
	icon: Icon,
	color,
}: {
	label: string
	value: number
	sublabel: string
	icon: LucideIcon
	color: keyof typeof DOT_COLORS
}) {
	return (
		<div className="rounded-lg border border-line bg-panel px-4 py-3">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-semibold text-cream/80">
					<span className={`inline-block size-1.5 rounded-full ${DOT_COLORS[color]}`} />
					{label}
				</div>
				<Icon size={16} className={ICON_COLORS[color]} />
			</div>
			<div className="text-3xl font-bold text-cream">{value}</div>
			<div className="text-xs text-cream/40">{sublabel}</div>
		</div>
	)
}
