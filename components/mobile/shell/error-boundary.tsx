"use client";

import { Component, type ReactNode } from "react";

interface Props {
	readonly children: ReactNode;
	readonly onReload?: () => void;
}

interface State {
	readonly failed: boolean;
}

export class MobileErrorBoundary extends Component<Props, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(): State {
		return { failed: true };
	}

	render(): ReactNode {
		if (!this.state.failed) return this.props.children;
		const { onReload } = this.props;
		return (
			<div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
				<p>Something went wrong.</p>
				{onReload ? (
					<button
						type="button"
						onClick={onReload}
						className="min-h-11 min-w-11 rounded-md border border-current px-4"
					>
						Reload
					</button>
				) : null}
			</div>
		);
	}
}
