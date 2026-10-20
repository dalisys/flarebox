import { useEffect, useRef, useState } from "react";

// A desktop panel width the user can drag (or set with arrow keys). Saved per browser.
// edge says which side of the panel the handle sits on.
export function useResizableWidth(key: string, initial: number, min: number, max: number, edge: "left" | "right", label: string) {
	const [width, setWidth] = useState(initial);
	const drag = useRef<{ x: number; width: number } | null>(null);
	useEffect(() => {
		try { const saved = Number(localStorage.getItem(key)); if (saved) setWidth(Math.min(max, Math.max(min, saved))); } catch { /* Default width. */ }
	}, [key, min, max]);
	const save = (next: number) => {
		const clamped = Math.round(Math.min(max, Math.max(min, next)));
		setWidth(clamped);
		try { localStorage.setItem(key, String(clamped)); } catch { /* Width lasts until reload. */ }
	};
	const direction = edge === "right" ? 1 : -1;
	const handle = <div
		role="separator"
		aria-orientation="vertical"
		aria-label={label}
		aria-valuenow={width}
		aria-valuemin={min}
		aria-valuemax={max}
		tabIndex={0}
		className={`resize-handle is-${edge}`}
		onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width }; }}
		onPointerMove={(event) => { if (drag.current) save(drag.current.width + (event.clientX - drag.current.x) * direction); }}
		onPointerUp={() => { drag.current = null; }}
		onPointerCancel={() => { drag.current = null; }}
		onDoubleClick={() => save(initial)}
		onKeyDown={(event) => {
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); save(width + (event.key === "ArrowRight" ? 16 : -16) * direction); }
		}}
	/>;
	return [width, handle] as const;
}
