import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormFactorSwitch } from "../components/mobile/shell/form-factor-switch.tsx";

const desktop = <div className="d" data-x="1">desktop</div>;
const mobile = <div className="m">mobile</div>;

describe("FormFactorSwitch", () => {
	it("renders the desktop node on the server", () => {
		const out = renderToStaticMarkup(<FormFactorSwitch enabled desktop={desktop} mobile={mobile} />);
		assert.equal(out, renderToStaticMarkup(desktop));
	});
	it("renders the desktop node when disabled", () => {
		const out = renderToStaticMarkup(<FormFactorSwitch enabled={false} desktop={desktop} mobile={mobile} />);
		assert.equal(out, renderToStaticMarkup(desktop));
	});
});
