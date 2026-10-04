/* SPDX-License-Identifier: GPL-3.0-or-later */

import type { MangaProviding, SourceManga } from "@paperback/types";

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, MangaResource } from "../Shared/models";
import { parseMangaInfo } from "../Shared/parser";

export class MangaImplementation implements MangaProviding {
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const logPrefix = "[getMangaDetails]";
    console.log(`${logPrefix} start: ${mangaId}`);

    const doc = await makeRequest<JsonApiDocument<MangaResource>>(
      `/manga/${encodeURIComponent(mangaId)}`,
      { auth: "optional" },
    );

    const result = { mangaId, mangaInfo: parseMangaInfo(doc.data) };
    console.log(`${logPrefix} complete: ${mangaId}`);
    return result;
  }
}
