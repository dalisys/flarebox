import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Opening an email or a composer only changes app state, so the phone's Back
 * button used to leave the page. This adds one history entry per open layer
 * (email, then reply) so Back closes the top layer instead.
 */
export function useBackToClose(depth: number, onBack: () => void) {
	const pushed = useRef(0);
	const ignorePops = useRef(0);
	const onBackRef = useRef(onBack);
	onBackRef.current = onBack;
	const { key } = useLocation();

	// A real navigation (folder, settings, ...) owns history now; forget our entries.
	useEffect(() => { pushed.current = 0; }, [key]);

	useEffect(() => {
		while (pushed.current < depth) {
			window.history.pushState(window.history.state, "");
			pushed.current++;
		}
		// Closed from the UI (back arrow, send, discard): drop the entries we added.
		if (pushed.current > depth) {
			const extra = pushed.current - depth;
			pushed.current = depth;
			ignorePops.current++; // go(-n) fires a single popstate
			window.history.go(-extra);
		}
	}, [depth]);

	useEffect(() => {
		const onPop = () => {
			if (ignorePops.current > 0) { ignorePops.current--; return; }
			if (pushed.current === 0) return;
			pushed.current--;
			onBackRef.current();
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);
}
