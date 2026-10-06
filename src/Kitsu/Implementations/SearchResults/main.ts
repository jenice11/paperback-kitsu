/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  EndOfPageResults,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
} from "@paperback/types";

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, MangaResource } from "../Shared/models";
import { parseSearchResult } from "../Shared/parser";

// Kitsu allows at most 20 resources per page on this route.
const PAGE_SIZE = 20;

export async function getSearchResults(
  query: SearchQuery<Metadata>,
  metadata: Metadata | undefined,
): Promise<PagedResults<SearchResultItem>> {
  const title = query.title.trim();
  if (title.length === 0) {
    return EndOfPageResults;
  }

  const offset = typeof metadata === "number" ? metadata : 0;
  const doc = await makeRequest<JsonApiDocument<MangaResource[]>>("/manga", {
    // Optional auth: R18 titles only show up when logged in with mature
    // content enabled on the Kitsu account.
    auth: "optional",
    query: {
      "filter[text]": title,
      "page[limit]": PAGE_SIZE,
      "page[offset]": offset,
    },
  });

  const hasNextPage = doc.links?.next != null && doc.data.length > 0;
  return {
    items: doc.data.map(parseSearchResult),
    metadata: hasNextPage ? offset + PAGE_SIZE : undefined,
  };
}
