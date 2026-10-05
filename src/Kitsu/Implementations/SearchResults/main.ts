/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  EndOfPageResults,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
} from "@paperback/types";

import { makeRequest } from "../../Services/Requests";
import { MangaImplementation } from "../Manga/main";
import type { JsonApiDocument, MangaResource } from "../Shared/models";
import { parseSearchResult } from "../Shared/parser";

// Kitsu allows at most 20 resources per page on this route.
const PAGE_SIZE = 20;

export class SearchResultsImplementation
  extends MangaImplementation
  implements SearchResultsProviding
{
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const logPrefix = "[getSearchResults]";
    const title = query.title.trim();
    if (title.length === 0) {
      return EndOfPageResults;
    }

    const offset = typeof metadata === "number" ? metadata : 0;
    console.log(`${logPrefix} start: "${title}" offset=${offset}`);

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

    const items = doc.data.map(parseSearchResult);
    const hasNextPage = doc.links?.next != null && doc.data.length > 0;

    console.log(`${logPrefix} complete: ${items.length} result(s), hasNextPage=${hasNextPage}`);
    return { items, metadata: hasNextPage ? offset + PAGE_SIZE : undefined };
  }
}
