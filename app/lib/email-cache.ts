import type { Email } from "~/types";

/** Update an email across list, search, thread, and detail cache shapes. */
export function mapCachedEmail(value: unknown, id: string, update: (email: Email) => Email): unknown {
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((email) => email?.id === id ? update(email) : email);
	if ("emails" in value && Array.isArray(value.emails)) return { ...value, emails: mapCachedEmail(value.emails, id, update) };
	if ("results" in value && Array.isArray(value.results)) return { ...value, results: mapCachedEmail(value.results, id, update) };
	return "id" in value && value.id === id ? update(value as Email) : value;
}

export function restoreEmailFields(current: unknown, previous: unknown, id: string, patch: Partial<Email>): unknown {
	let before: Email | undefined;
	mapCachedEmail(previous, id, (email) => { before = email; return email; });
	if (!before) return current;
	return mapCachedEmail(current, id, (email) => {
		const restored = { ...email };
		for (const key of Object.keys(patch) as (keyof Email)[]) {
			// Preserve other messages and newer changes made while this request ran.
			if (email[key] === patch[key]) Object.assign(restored, { [key]: before![key] });
		}
		return restored;
	});
}
