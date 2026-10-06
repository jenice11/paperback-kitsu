/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  BasicRateLimiter,
  type Extension,
  type Form,
  type MangaProgressProviding,
  type Metadata,
  type SearchQuery,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SourceManga,
  type TrackedMangaChapterReadAction,
} from "@paperback/types";

import { getMangaDetails } from "./Implementations/Manga/main";
import {
  getMangaProgress,
  getMangaProgressManagementForm,
  processChapterReadActionQueue,
} from "./Implementations/MangaProgress/main";
import { getSearchResults } from "./Implementations/SearchResults/main";
import { SettingsForm } from "./Implementations/SettingsForm/form";

// The host calls these methods on the extension object; the logic lives in
// plain functions next to the screens that use it.
export class KitsuExtension
  implements Extension, SearchResultsProviding, SettingsFormProviding, MangaProgressProviding
{
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new SettingsForm();
  }

  getMangaDetails(mangaId: string) {
    return getMangaDetails(mangaId);
  }

  getSearchResults(query: SearchQuery<Metadata>, metadata: Metadata | undefined) {
    return getSearchResults(query, metadata);
  }

  getMangaProgressManagementForm(sourceManga: SourceManga) {
    return getMangaProgressManagementForm(sourceManga);
  }

  getMangaProgress(sourceManga: SourceManga) {
    return getMangaProgress(sourceManga);
  }

  processChapterReadActionQueue(actions: TrackedMangaChapterReadAction[]) {
    return processChapterReadActionQueue(actions);
  }
}

export const Kitsu = new KitsuExtension();
