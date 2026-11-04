import type { QuestionFormDraft } from "@/src/core";

export interface DockDraftReporter {
	report(form: QuestionFormDraft): void;
	dispose(): void;
}
export interface DockDraftReporterDeps {
	readonly save: (form: QuestionFormDraft) => void;
	readonly setTimer: (fn: () => void, ms: number) => unknown;
	readonly clearTimer: (handle: unknown) => void;
	readonly debounceMs?: number;
}

/** Reports dock edits: the first edit at once (marks the dock touched), later ones debounced. */
export function createDockDraftReporter(deps: DockDraftReporterDeps): DockDraftReporter {
	const wait = deps.debounceMs ?? 300;
	let reported = false;
	let latest: QuestionFormDraft | null = null;
	let timer: unknown = null;
	const fire = (): void => {
		timer = null;
		if (latest) deps.save(latest);
		latest = null;
	};
	return {
		report(form) {
			if (!reported) {
				reported = true;
				deps.save(form);
				return;
			}
			latest = form;
			if (timer !== null) deps.clearTimer(timer);
			timer = deps.setTimer(fire, wait);
		},
		dispose() {
			if (timer !== null) deps.clearTimer(timer);
			if (latest) deps.save(latest); // unmount keeps the last keystrokes
			timer = null;
			latest = null;
		},
	};
}
