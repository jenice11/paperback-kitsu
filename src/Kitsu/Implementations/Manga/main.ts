/* SPDX-License-Identifier: GPL-3.0-or-later */

import type { MangaProviding, SourceManga } from "@paperback/types";

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, MangaResource } from "../Shared/models/main";
import { manga } from "../Shared/parser/main";

export class MangaImplementation implements MangaProviding {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const doc = await makeRequest<JsonApiDocument<MangaResource>>(
      `/manga/${encodeURIComponent(mangaId)}`,
      { auth: "optional" },
    );
    return { mangaId, mangaInfo: manga.parseMangaInfo(doc.data) };
  }
}
