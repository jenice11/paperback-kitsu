/* SPDX-License-Identifier: GPL-3.0-or-later */

import { BasicRateLimiter, type Extension } from "@paperback/types";

import { applyMixins } from "./Implementations/helper";
import { MangaImplementation } from "./Implementations/Manga/main";
import { MangaProgressImplementation } from "./Implementations/MangaProgress/main";
import { SearchResultsImplementation } from "./Implementations/SearchResults/main";
import { SettingsFormImplementation } from "./Implementations/SettingsForm/main";

// The feature classes are copied onto the extension at runtime by applyMixins;
// merging this interface into the class is how the type checker learns about
// them. Safe: they only add methods, no fields that need initialising.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export interface KitsuExtension
  extends
    MangaImplementation,
    MangaProgressImplementation,
    SearchResultsImplementation,
    SettingsFormImplementation {}

export class KitsuExtension implements Extension {
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
  MangaImplementation,
  MangaProgressImplementation,
  SearchResultsImplementation,
  SettingsFormImplementation,
]);

export const Kitsu = new KitsuExtension();
