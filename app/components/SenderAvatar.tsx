const avatarColors = ["lavender", "blue", "teal", "rose", "amber"];

export function senderName(sender: string) {
	const name = sender.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
	return (name.includes("@") ? name.split("@")[0] : name) || sender;
}

export default function SenderAvatar({ sender }: { sender: string }) {
	const name = senderName(sender);
	const words = name.split(/[\s._-]+/).filter(Boolean);
	const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 1)).toUpperCase();
	const hash = Array.from(sender.toLowerCase()).reduce((value, character) => value + character.charCodeAt(0), 0);
	return <span aria-hidden="true" className={`sender-avatar sender-avatar--${avatarColors[hash % avatarColors.length]}`}>{initials}</span>;
}
