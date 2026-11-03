import { encode } from "uqr";

const QUIET = 4;

/** Horizontal runs of dark modules as path commands; one path keeps the markup small. */
function darkRuns(rows: readonly (readonly boolean[])[]): string {
	return rows
		.flatMap((row, y) => {
			const runs: string[] = [];
			let start = -1;
			row.forEach((dark, x) => {
				if (dark && start < 0) start = x;
				if (start >= 0 && (!dark || x === row.length - 1)) {
					const end = dark ? x + 1 : x;
					runs.push(`M${start + QUIET} ${y + QUIET}h${end - start}v1h-${end - start}z`);
					start = -1;
				}
			});
			return runs;
		})
		.join("");
}

/** Inline SVG (never an external image) with a white quiet zone so it scans on a dark theme. */
export function PairQr({ value, size = 240 }: { value: string; size?: number }) {
	const { data, size: modules } = encode(value, { border: 0 });
	const span = modules + QUIET * 2;
	return (
		<svg
			role="img"
			aria-label="QR code for pairing a phone"
			width={size}
			height={size}
			viewBox={`0 0 ${span} ${span}`}
			shapeRendering="crispEdges"
		>
			<rect width={span} height={span} fill="#fff" />
			<path d={darkRuns(data)} fill="#000" />
		</svg>
	);
}
