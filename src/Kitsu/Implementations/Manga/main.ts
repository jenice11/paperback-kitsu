/* SPDX-License-Identifier: GPL-3.0-or-later */

import type { SourceManga } from "@paperback/types";

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, MangaResource } from "../Shared/models";
import { parseMangaInfo } from "../Shared/parser";

export async function getMangaDetails(mangaId: string): Promise<SourceManga> {
  const doc = await makeRequest<JsonApiDocument<MangaResource>>(
    `/manga/${encodeURIComponent(mangaId)}`,
    { auth: "optional" },
  );
  return { mangaId, mangaInfo: parseMangaInfo(doc.data) };
}
