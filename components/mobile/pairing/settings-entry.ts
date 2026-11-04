/** Settings section ids owned by the mobile fork; shown only with the shell flag on. */
const MOBILE_ONLY: ReadonlySet<string> = new Set(["phone"]);

export function visibleSettingsSections<T extends { readonly id: string }>(sections: readonly T[], enabled: boolean): readonly T[] {
	return enabled ? sections : sections.filter((s) => !MOBILE_ONLY.has(s.id));
}
