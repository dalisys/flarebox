import { useEffect, useRef } from "react";
import Sidebar from "~/components/Sidebar";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailNavigation() {
	const { isSidebarOpen, isDesktopSidebarCollapsed, closeSidebar } = useUIStore();
	const navigationRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isSidebarOpen || !matchMedia("(max-width: 767px)").matches) return;
		const previousFocus = document.activeElement as HTMLElement | null;
		const navigation = navigationRef.current;
		navigation?.setAttribute("role", "dialog");
		navigation?.setAttribute("aria-modal", "true");
		navigation?.setAttribute("aria-label", "Mail navigation");
		const siblings = Array.from(navigation?.parentElement?.children ?? []).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== navigation && !element.classList.contains("mail-navigation-backdrop"));
		const previousInert = siblings.map((element) => element.inert);
		siblings.forEach((element) => { element.inert = true; });
		const controls = () => Array.from(navigation?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, select, textarea, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
		const frame = requestAnimationFrame(() => controls()[0]?.focus());
		const viewport = matchMedia("(max-width: 767px)");
		const onViewportChange = () => { if (!viewport.matches) closeSidebar(); };
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (event.key === "Escape") { event.preventDefault(); closeSidebar(); }
			if (event.key !== "Tab") return;
			const items = controls();
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
		};
		document.addEventListener("keydown", onKeyDown);
		viewport.addEventListener("change", onViewportChange);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("keydown", onKeyDown);
			viewport.removeEventListener("change", onViewportChange);
			navigation?.removeAttribute("role");
			navigation?.removeAttribute("aria-modal");
			navigation?.removeAttribute("aria-label");
			siblings.forEach((element, index) => { element.inert = previousInert[index]; });
			if (document.activeElement === document.body || navigation?.contains(document.activeElement)) previousFocus?.focus();
		};
	}, [isSidebarOpen, closeSidebar]);

	return <>
		{isSidebarOpen && <button type="button" className="mail-navigation-backdrop md:hidden" onClick={closeSidebar} aria-label="Close navigation" tabIndex={-1} />}
		<div ref={navigationRef} id="mail-navigation" className={`mail-navigation ${isSidebarOpen ? "is-open" : ""} ${isDesktopSidebarCollapsed ? "is-collapsed" : ""}`}><Sidebar /></div>
	</>;
}
