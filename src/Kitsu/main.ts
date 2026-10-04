/* SPDX-License-Identifier: GPL-3.0-or-later */

import { BasicRateLimiter, type Extension, type MangaProviding } from "@paperback/types";

import { applyMixins } from "./Implementations/helper";
import { MangaImplementation } from "./Implementations/Manga/main";
import { MangaProgressImplementation } from "./Implementations/MangaProgress/main";
import { SearchResultsImplementation } from "./Implementations/SearchResults/main";
import { SettingsFormImplementation } from "./Implementations/SettingsForm/main";

export interface KitsuImplementation
  extends
    MangaImplementation,
    MangaProgressImplementation,
    SearchResultsImplementation,
    SettingsFormImplementation {}

export class KitsuExtension implements Omit<Extension, keyof MangaProviding> {
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 4,
    bufferInterval: 1,
    ignoreImages: true,
  });

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
  }
}

applyMixins(KitsuExtension, [
  SettingsFormImplementation,
  SearchResultsImplementation,
  MangaImplementation,
  MangaProgressImplementation,
]);

export const Kitsu = new KitsuExtension();
