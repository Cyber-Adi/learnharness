import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormFactorSwitch } from "../components/mobile/shell/form-factor-switch.tsx";

const desktop = <div className="d">desktop</div>;
const mobile = <div className="m">mobile</div>;

describe("FormFactorSwitch initial", () => {
	it("renders the initial tree on the server for both values", () => {
		for (const initial of ["mobile", "desktop"] as const) {
			const out = renderToStaticMarkup(<FormFactorSwitch enabled initial={initial} desktop={desktop} mobile={mobile} />);
			assert.equal(out, renderToStaticMarkup(initial === "mobile" ? mobile : desktop));
		}
	});
	it("flag off means desktop even when initial is mobile", () => {
		const out = renderToStaticMarkup(<FormFactorSwitch enabled={false} initial="mobile" desktop={desktop} mobile={mobile} />);
		assert.equal(out, renderToStaticMarkup(desktop));
	});
});
