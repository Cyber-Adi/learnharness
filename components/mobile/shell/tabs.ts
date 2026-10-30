export interface MobileTab {
	readonly id: string;
	readonly label: string;
	readonly href: string;
}

// Graph, Practice and Activity join here when the loop widens.
export const MOBILE_TABS: readonly MobileTab[] = Object.freeze([
	Object.freeze({ id: "learn", label: "Learn", href: "/" }),
]);

export function isTabActive(href: string, pathname: string | null | undefined): boolean {
	if (!pathname) return false;
	const path = href.split(/[?#]/)[0] ?? href;
	if (path === "/") return pathname === "/";
	return pathname === path || pathname.startsWith(`${path}/`);
}
