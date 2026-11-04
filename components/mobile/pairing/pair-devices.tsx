import { relativeTime, type PairDevice } from "./pair-dialog-model.ts";

interface Props {
	readonly devices: readonly PairDevice[];
	readonly now: number;
	readonly confirmingId: string | null;
	readonly onAskRevoke: (id: string) => void;
	readonly onConfirmRevoke: (id: string) => void;
	readonly onCancel: () => void;
}

const BTN = "rounded-md border border-border px-2 py-1 text-xs hover:bg-accent";
const DANGER = "rounded-md border border-destructive/60 px-2 py-1 text-xs text-destructive hover:bg-destructive/10";

/** Presentational: the parent owns which device is awaiting confirmation. */
export function DeviceList({ devices, now, confirmingId, onAskRevoke, onConfirmRevoke, onCancel }: Props) {
	if (devices.length === 0) {
		return <p className="text-xs text-muted-foreground">No phones paired yet.</p>;
	}
	return (
		<ul className="flex flex-col gap-2" data-testid="pair-devices">
			{devices.map((d) => (
				<li key={d.id} className="flex items-center justify-between gap-4 py-1">
					<span className="min-w-0">
						<span className="block truncate font-prose text-(length:--lh-prose-size)">{d.name}</span>
						<span className="block text-xs text-muted-foreground/70">
							Paired {d.createdAt.slice(0, 10)}, last seen {relativeTime(d.lastSeenAt, now)}
						</span>
					</span>
					{confirmingId === d.id ? (
						<span className="flex shrink-0 items-center gap-2" role="group" aria-label={`Revoke ${d.name}?`}>
							<span className="text-xs">Revoke {d.name}?</span>
							<button type="button" className={DANGER} onClick={() => onConfirmRevoke(d.id)}>Revoke device</button>
							<button type="button" className={BTN} onClick={onCancel}>Cancel</button>
						</span>
					) : (
						<button type="button" className={BTN} onClick={() => onAskRevoke(d.id)}>Revoke</button>
					)}
				</li>
			))}
		</ul>
	);
}
