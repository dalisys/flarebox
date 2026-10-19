import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

type Layer = { onBack: () => void };

// One shared stack for every open layer (email, reply, agent chat), oldest
// first, so one Back press closes only the layer on top.
const stack: Layer[] = [];
let ignorePops = 0;
let listening = false;

function onPopState() {
	if (ignorePops > 0) { ignorePops--; return; }
	stack.pop()?.onBack();
}

function removeLast(layer: Layer, count: number) {
	for (let i = stack.length - 1; i >= 0 && count > 0; i--) {
		if (stack[i] === layer) { stack.splice(i, 1); count--; }
	}
}

/**
 * Opening an email, a composer, or the agent only changes app state, so the
 * phone's Back button used to leave the page. This adds one history entry per
 * open layer so Back closes the top layer instead.
 */
export function useBackToClose(depth: number, onBack: () => void) {
	const layer = useRef<Layer>({ onBack }).current;
	layer.onBack = onBack;
	const { key } = useLocation();

	useEffect(() => {
		if (!listening) { window.addEventListener("popstate", onPopState); listening = true; }
	}, []);

	// A real navigation (folder, settings, ...) or unmount: our entries are stale.
	useEffect(() => () => removeLast(layer, Infinity), [key, layer]);

	useEffect(() => {
		let mine = stack.filter((item) => item === layer).length;
		while (mine < depth) {
			window.history.pushState(window.history.state, "");
			stack.push(layer);
			mine++;
		}
		// Closed from the UI (back arrow, send, discard): drop the entries we added.
		if (mine > depth) {
			const extra = mine - depth;
			removeLast(layer, extra);
			ignorePops++; // go(-n) fires a single popstate
			window.history.go(-extra);
		}
	}, [depth, layer]);
}
