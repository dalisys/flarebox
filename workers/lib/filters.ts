// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Mail filters: per-mailbox rules that run on new non-spam mail. First matching rule wins. */
import { z } from "zod";

const text = z.string().trim().max(200);

export const FilterRuleSchema = z.object({
	id: z.string().min(1).max(64),
	name: text.optional(),
	enabled: z.boolean(),
	// All filled conditions must match (case-insensitive "contains").
	conditions: z.object({ from: text.optional(), to: text.optional(), subject: text.optional(), body: text.optional() })
		.refine((c) => Object.values(c).some(Boolean), { message: "Add at least one condition" }),
	actions: z.object({ folder: z.string().min(1).max(100).optional(), markRead: z.boolean().optional(), star: z.boolean().optional() })
		.refine((a) => a.folder || a.markRead || a.star, { message: "Add at least one action" })
		.refine((a) => a.folder !== "sent" && a.folder !== "draft", { message: "Mail cannot be moved to Sent or Drafts" }),
});

// Array order is rule order.
export const FiltersSchema = z.object({ rules: z.array(FilterRuleSchema).max(100) });

export type FilterRule = z.infer<typeof FilterRuleSchema>;

export interface FilterMessage {
	from?: string;
	to?: string;
	subject?: string;
	body?: string;
}

export function filtersKey(mailboxId: string): string {
	return `config/filters/${encodeURIComponent(mailboxId.toLowerCase())}.json`;
}

export function ruleMatches(rule: FilterRule, message: FilterMessage): boolean {
	if (!rule.enabled) return false;
	const entries = Object.entries(rule.conditions).filter(([, value]) => value);
	return entries.length > 0 && entries.every(([field, value]) =>
		(message[field as keyof FilterMessage] || "").toLowerCase().includes(value!.toLowerCase()));
}

export function findMatchingRule(rules: FilterRule[], message: FilterMessage): FilterRule | undefined {
	return rules.find((rule) => ruleMatches(rule, message));
}

/** Build the matched fields from stored or parsed mail. HTML tags are dropped so they do not match "body contains". */
export function toFilterMessage(input: { sender?: string | null; recipient?: string | null; subject?: string | null; body?: string | null }): FilterMessage {
	return {
		from: input.sender || "",
		to: input.recipient || "",
		subject: input.subject || "",
		body: (input.body || "").slice(0, 200_000).replace(/<[^>]*>/g, " "),
	};
}
