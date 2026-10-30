import type { MetadataRoute } from "next";

// Upstream dark --background; icons come from scripts/mobile-icons.mjs.
const COLOR = "#141414";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Learning Harness",
		short_name: "LearnHarness",
		start_url: "/?source=pwa",
		scope: "/",
		display: "standalone",
		background_color: COLOR,
		theme_color: COLOR,
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{ src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
	};
}
