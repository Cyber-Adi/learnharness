import { PairPage } from "@/components/mobile/pairing/pair-page";

// Public on the remote host; the pairing code arrives in the URL fragment, never the query.
export default function Page() {
	return <PairPage />;
}
