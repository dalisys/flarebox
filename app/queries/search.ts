// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { searchQueryParams } from "~/lib/search-parser";
import api from "~/services/api";
import type { Email } from "~/types";
import { queryKeys } from "./keys";

export const SEARCH_PAGE_SIZE = 25;

interface SearchResponse {
	emails: Email[];
	totalCount: number;
}

export function useSearchEmails(
	mailboxId: string | undefined,
	query: string,
	page: number,
	sort = "newest",
) {
	return useQuery<{ results: Email[]; totalCount: number }>({
		queryKey: mailboxId
			? [...queryKeys.search.results(mailboxId, query, page), sort]
			: ["search", "_disabled"],
		queryFn: async () => {
			const params = { ...searchQueryParams(query), page: String(page), limit: String(SEARCH_PAGE_SIZE), sort };

			const data = await api.searchEmails(mailboxId!, params) as
				| SearchResponse
				| Email[];
			if (data && typeof data === "object" && "emails" in data) {
				return {
					results: (data as SearchResponse).emails ?? [],
					totalCount: (data as SearchResponse).totalCount ?? 0,
				};
			}
			const arr = Array.isArray(data) ? data : [];
			return { results: arr, totalCount: arr.length };
		},
		enabled: !!mailboxId,
	});
}
