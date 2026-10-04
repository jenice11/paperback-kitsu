/* SPDX-License-Identifier: GPL-3.0-or-later */

import { ContentRating, type ExtensionInfo, SourceIntents } from "@paperback/types";

export default {
  name: "Kitsu",
  description: "Extension that integrates with kitsu.app to track your manga reading progress.",
  version: "1.0.0-alpha.1",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.PROGRESS_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
  ],
  badges: [],
  developers: [
    {
      name: "jenice11",
      github: "https://github.com/jenice11",
    },
  ],
} as ExtensionInfo;
