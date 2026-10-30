import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileShell, viewportVar } from "../components/mobile/shell/mobile-shell.tsx";
import { MobileErrorBoundary } from "../components/mobile/shell/error-boundary.tsx";
import { MOBILE_TABS, type MobileTab } from "../components/mobile/shell/tabs.ts";

const APP = join(import.meta.dirname, "..", "app");

function pagePatterns(dir: string, rel = ""): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return name === "api" ? [] : pagePatterns(full, `${rel}/${name}`);
		return name === "page.tsx" ? [rel === "" ? "/" : rel] : [];
	});
}

function matches(pattern: string, href: string): boolean {
	const re = new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+")}$`);
	return re.test(href.split(/[?#]/)[0] ?? "");
}

function makeTabs(n: number): readonly MobileTab[] {
	return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}`, href: `/t${i}` }));
}

describe("tabs", () => {
	it("every tab href resolves to an app route", () => {
		const patterns = pagePatterns(APP);
		assert.ok(patterns.includes("/"));
		for (const tab of MOBILE_TABS) {
			assert.ok(patterns.some((p) => matches(p, tab.href)), `no route for ${tab.href}`);
		}
	});
	it("tab table is frozen", () => {
		assert.ok(Object.isFrozen(MOBILE_TABS));
	});
});

describe("MobileShell", () => {
	for (const n of [1, 2, 5]) {
		it(`the tab bar holds for ${n} tabs`, () => {
			const html = renderToStaticMarkup(
				<MobileShell tabs={makeTabs(n)} pathname="/"><p>x</p></MobileShell>,
			);
			const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
			assert.equal((nav.match(/<a /g) ?? []).length, n);
			assert.equal((nav.match(/min-h-11 min-w-11/g) ?? []).length, n);
			assert.ok(nav.includes('aria-label="Primary"'));
		});
	}
	it("the active tab has aria-current=page", () => {
		const html = renderToStaticMarkup(
			<MobileShell tabs={makeTabs(3)} pathname="/t1"><p>x</p></MobileShell>,
		);
		assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
		assert.match(html, /<a [^>]*aria-current="page"[^>]*>[^]*?Tab 1/);
	});
	it("the shell has the data-lh-mobile root and one main scroll container", () => {
		const html = renderToStaticMarkup(<MobileShell pathname="/"><p>kid</p></MobileShell>);
		assert.match(html, /^<div [^>]*data-lh-mobile/);
		assert.equal((html.match(/<main/g) ?? []).length, 1);
		assert.match(html, /<main[^>]*>[^]*kid[^]*<\/main>/);
		assert.ok(html.includes("100dvh"));
	});
	it("the shell renders no drag bands", () => {
		const html = renderToStaticMarkup(<MobileShell pathname="/"><p>x</p></MobileShell>);
		assert.ok(!html.includes("lh-drag"));
	});
});

describe("MobileErrorBoundary", () => {
	it("shows a fallback on a render error", () => {
		const state = MobileErrorBoundary.getDerivedStateFromError();
		assert.deepEqual(state, { failed: true });
		function Boom(): React.ReactElement {
			throw new Error("boom");
		}
		// renderToStaticMarkup does not invoke error boundaries, so the render
		// path is covered by rendering the failed state directly.
		const failed = new MobileErrorBoundary({ children: <Boom />, onReload: () => {} });
		failed.state = state;
		const html = renderToStaticMarkup(<>{failed.render()}</>);
		assert.ok(html.includes("Something went wrong."));
	});
	it("the reload control renders only when a handler is passed", () => {
		const render = (onReload?: () => void) => {
			const b = new MobileErrorBoundary({ children: null, onReload });
			b.state = { failed: true };
			return renderToStaticMarkup(<>{b.render()}</>);
		};
		assert.ok(!render().includes("Reload"));
		const withBtn = render(() => {});
		assert.ok(withBtn.includes("Reload"));
		assert.ok(withBtn.includes("min-h-11"));
	});
});

describe("viewportVar", () => {
	it("formats height in px and ignores invalid values", () => {
		assert.equal(viewportVar(640), "640px");
		assert.equal(viewportVar(640.5), "640.5px");
		for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			assert.equal(viewportVar(bad), null);
		}
	});
});

// Device pass (Phase 0 gate): the desktop composer, position: fixed, escaped
// the shell's scroll container and slid under the tab bar, untappable.
describe("MobileShell containment (device pass)", () => {
	const html = renderToStaticMarkup(<MobileShell pathname="/">x</MobileShell>);
	it("main is the containing block for fixed-position children", () => {
		assert.match(html, /<main[^>]*style="[^"]*contain:layout paint/);
	});
	it("the tab bar height comes from the --lh-m-tabbar token", () => {
		assert.match(html, /<nav[^>]*style="[^"]*min-height:var\(--lh-m-tabbar, 56px\)/);
	});
});
