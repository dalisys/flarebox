// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Mailbox-scoped search uses bound values and a fixed set of SQL columns.
export interface SearchFilterOptions {
	query: string;
	filename?: string;
	folder?: string;
	from?: string;
	to?: string;
	subject?: string;
	date_start?: string;
	date_end?: string;
	is_read?: boolean;
	is_starred?: boolean;
	has_attachment?: boolean;
}

export function buildSearchConditions(
	options: SearchFilterOptions,
	tableAlias = "",
): { conditions: string[]; params: (string | number)[] } {
	const { query, folder, from, to, subject, date_start, date_end, is_read, is_starred, has_attachment, filename } = options;
	const prefix = tableAlias ? `${tableAlias}.` : "";
	const conditions: string[] = [];
	const params: (string | number)[] = [];
	const contains = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
	let paramIdx = 0;

	const addParam = (value: string | number) => {
		paramIdx++;
		params.push(value);
		return `?${paramIdx}`;
	};

	if (query) {
		const p1 = addParam(contains(query));
		const p2 = addParam(contains(query));
		const p3 = addParam(contains(query));
		const p4 = addParam(contains(query));
		conditions.push(`(${prefix}subject LIKE ${p1} ESCAPE '\\' OR ${prefix}body LIKE ${p2} ESCAPE '\\' OR ${prefix}sender LIKE ${p3} ESCAPE '\\' OR ${prefix}recipient LIKE ${p4} ESCAPE '\\' OR ${prefix}cc LIKE ${p4} ESCAPE '\\' OR ${prefix}bcc LIKE ${p4} ESCAPE '\\')`);
	}
	if (folder && folder !== "activity") {
		const p = addParam(folder);
		conditions.push(`${prefix}folder_id = (SELECT id FROM folders WHERE name = ${p} OR id = ${p} LIMIT 1)`);
	}
	if (from) { const p = addParam(contains(from)); conditions.push(`${prefix}sender LIKE ${p} ESCAPE '\\'`); }
	if (to) { const p = addParam(contains(to)); conditions.push(`(${prefix}recipient LIKE ${p} ESCAPE '\\' OR ${prefix}cc LIKE ${p} ESCAPE '\\' OR ${prefix}bcc LIKE ${p} ESCAPE '\\')`); }
	if (subject) { const p = addParam(contains(subject)); conditions.push(`${prefix}subject LIKE ${p} ESCAPE '\\'`); }
	if (date_start) { const p = addParam(date_start); conditions.push(`${prefix}date >= ${p}`); }
	if (date_end) { const p = addParam(date_end); conditions.push(`${prefix}date <= ${p}`); }
	if (is_read !== undefined) { const p = addParam(is_read ? 1 : 0); conditions.push(`${prefix}read = ${p}`); }
	if (is_starred !== undefined) { const p = addParam(is_starred ? 1 : 0); conditions.push(`${prefix}starred = ${p}`); }
	if (has_attachment !== undefined) { conditions.push(`${prefix}id ${has_attachment ? "IN" : "NOT IN"} (SELECT email_id FROM attachments)`); }
	if (filename) { const p = addParam(contains(filename)); conditions.push(`${prefix}id IN (SELECT email_id FROM attachments WHERE filename LIKE ${p} ESCAPE '\\')`); }

	return { conditions, params };
}

