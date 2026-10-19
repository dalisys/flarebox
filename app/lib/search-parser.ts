// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface ParsedSearch {
	query: string;
	from?: string;
	to?: string;
	subject?: string;
	folder?: string;
	filename?: string;
	is_read?: boolean;
	is_starred?: boolean;
	has_attachment?: boolean;
	date_start?: string;
	date_end?: string;
}

/** Parse supported operators; keep unknown or invalid operators as searchable text. */
export function parseSearchQuery(input: string): ParsedSearch {
	const result: ParsedSearch = { query: "" };
	const remaining = input.replace(
		/(^|\s)(from|to|subject|in|filename|is|has|before|after):(?:"((?:\\.|[^"\\])*)"|(\S+))/gi,
		(full, space: string, operator: string, quoted: string | undefined, unquoted: string | undefined) => {
			const value = quoted !== undefined ? quoted.replace(/\\(["\\])/g, "$1") : unquoted!;
			if (!value.trim()) return full;
			switch (operator.toLowerCase()) {
				case "from": result.from = value; break;
				case "to": result.to = value; break;
				case "subject": result.subject = value; break;
				case "in": result.folder = value; break;
				case "filename": result.filename = value; break;
				case "is":
					if (value.toLowerCase() === "read") result.is_read = true;
					else if (value.toLowerCase() === "unread") result.is_read = false;
					else if (value.toLowerCase() === "starred") result.is_starred = true;
					else if (value.toLowerCase() === "unstarred") result.is_starred = false;
					else return full;
					break;
				case "has":
					if (value.toLowerCase() === "attachment") result.has_attachment = true;
					else if (value.toLowerCase() === "noattachment") result.has_attachment = false;
					else return full;
					break;
				case "before":
				case "after": {
					const date = normalizeDate(value);
					if (!date) return full;
					if (operator.toLowerCase() === "before") result.date_end = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : date;
					else result.date_start = date;
					break;
				}
			}
			return space;
		},
	);
	result.query = remaining.replace(/\s+/g, " ").trim();
	return result;
}

function normalizeDate(value: string): string | undefined {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	// Date.parse rolls invalid days into the next month. Reject those dates.
	if (/^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) return undefined;
	return date.toISOString();
}

/** Build a query that can be edited in the search box or bookmarked in the URL. */
export function buildSearchQuery(filters: ParsedSearch): string {
	const parts = [filters.query.trim()];
	const add = (operator: string, value: string | undefined) => {
		if (value) parts.push(`${operator}:"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
	};
	add("from", filters.from);
	add("to", filters.to);
	add("subject", filters.subject);
	add("in", filters.folder);
	add("filename", filters.filename);
	add("after", filters.date_start?.replace(/T00:00:00\.000Z$/, ""));
	add("before", filters.date_end?.replace(/T23:59:59\.999Z$/, ""));
	if (filters.is_read !== undefined) parts.push(filters.is_read ? "is:read" : "is:unread");
	if (filters.is_starred !== undefined) parts.push(filters.is_starred ? "is:starred" : "is:unstarred");
	if (filters.has_attachment !== undefined) parts.push(filters.has_attachment ? "has:attachment" : "has:noattachment");
	return parts.filter(Boolean).join(" ");
}

export function searchQueryParams(query: string): Record<string, string> {
	const parsed = parseSearchQuery(query);
	return Object.fromEntries(Object.entries(parsed)
		.filter(([, value]) => value !== undefined && value !== "")
		.map(([key, value]) => [key, String(value)]));
}
