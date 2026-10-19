import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUIStore } from "~/hooks/useUIStore";

export default function FloatingCompose({ onClick }: { onClick: () => void }) {
	const [mounted, setMounted] = useState(false);
	const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
	useEffect(() => { setMounted(true); }, []);
	// Keep the viewport control outside panels that clip their scrolling contents.
	return mounted && !isSidebarOpen ? createPortal(<button type="button" className="floating-compose md:hidden" onClick={onClick}><PencilSimpleIcon size={24} /><span>Compose</span></button>, document.body) : null;
}
