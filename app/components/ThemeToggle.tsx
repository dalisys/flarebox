import { Button, Tooltip } from "@cloudflare/kumo";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const storageKey = "agentic-inbox-theme";

export default function ThemeToggle() {
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		const update = () => setIsDark(document.documentElement.dataset.mode === "dark");
		const onStorage = (event: StorageEvent) => {
			if (event.key !== storageKey) return;
			const theme = event.newValue;
			document.documentElement.dataset.mode = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
			update();
		};
		const systemTheme = matchMedia("(prefers-color-scheme: dark)");
		const onSystemChange = () => {
			try {
				if (localStorage.getItem(storageKey) !== null) return;
			} catch {
				// Follow the system when browser storage is unavailable.
			}
			document.documentElement.dataset.mode = systemTheme.matches ? "dark" : "light";
			update();
		};
		update();
		window.addEventListener("storage", onStorage);
		systemTheme.addEventListener("change", onSystemChange);
		return () => {
			window.removeEventListener("storage", onStorage);
			systemTheme.removeEventListener("change", onSystemChange);
		};
	}, []);

	const toggle = () => {
		const next = !isDark;
		document.documentElement.dataset.mode = next ? "dark" : "light";
		try {
			localStorage.setItem(storageKey, next ? "dark" : "light");
		} catch {
			// The theme still works when browser storage is unavailable.
		}
		setIsDark(next);
	};

	return (
		<Tooltip content={isDark ? "Use light mode" : "Use dark mode"} side="bottom" asChild>
			<Button
				variant="ghost"
				shape="square"
				icon={isDark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
				onClick={toggle}
				aria-label={isDark ? "Use light mode" : "Use dark mode"}
				title=""
			/>
		</Tooltip>
	);
}
