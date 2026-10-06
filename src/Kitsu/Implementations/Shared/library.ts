/* SPDX-License-Identifier: GPL-3.0-or-later */

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, LibraryEntryResource, MangaResource } from "./models";
import { primaryTitle } from "./parser";
import { assertMustBeAuthenticated } from "./session";

// Kitsu library entries are keyed by user + media, hence the session's userId.
export async function findLibraryEntry(mangaId: string): Promise<LibraryEntryResource | undefined> {
  const { userId } = assertMustBeAuthenticated();
  const doc = await makeRequest<JsonApiDocument<LibraryEntryResource[]>>("/library-entries", {
    query: {
      "filter[user_id]": userId,
      "filter[kind]": "manga",
      "filter[manga_id]": mangaId,
      "page[limit]": 1,
    },
  });
  return doc.data[0];
}

/** What the progress screens need to know about a series. */
export async function getMangaSummary(
  mangaId: string,
): Promise<{ title: string; chapterCount: number | undefined }> {
  const doc = await makeRequest<JsonApiDocument<MangaResource>>(
    `/manga/${encodeURIComponent(mangaId)}`,
    {
      auth: "optional",
      query: { "fields[manga]": "canonicalTitle,titles,abbreviatedTitles,chapterCount" },
    },
  );
  const { chapterCount } = doc.data.attributes;
  return {
    title: primaryTitle(doc.data.attributes),
    // Series that are still running have no known total.
    chapterCount: typeof chapterCount === "number" && chapterCount > 0 ? chapterCount : undefined,
  };
}

/**
 * Writes `progress` to the user's library: updates entry `entryId`, or adds the
 * title as currently reading when there is no entry yet.
 */
export async function saveProgress(
  mangaId: string,
  progress: number,
  entryId: string | undefined,
): Promise<void> {
  if (entryId != null) {
    await makeRequest(`/library-entries/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      body: {
        data: {
          type: "libraryEntries",
          id: entryId,
          attributes: { progress },
        },
      },
    });
    return;
  }

  const { userId } = assertMustBeAuthenticated();
  await makeRequest("/library-entries", {
    method: "POST",
    body: {
      data: {
        type: "libraryEntries",
        attributes: { status: "current", progress },
        relationships: {
          user: { data: { type: "users", id: userId } },
          media: { data: { type: "manga", id: mangaId } },
        },
      },
    },
  });
}

/**
 * Kitsu progress is a whole number. Sources use decimals (10.5), zero
 * (prologues) and sometimes garbage; reduce all of that to a safe integer.
 */
function toProgress(chapterNum: number): number {
  return Number.isFinite(chapterNum) && chapterNum > 0 ? Math.floor(chapterNum) : 0;
}

/**
 * Records that these chapters of one manga were read: the highest one becomes
 * the user's progress, but progress never goes down and never exceeds the
 * series' chapter count (Kitsu rejects anything higher).
 */
export async function syncReadChapters(mangaId: string, chapterNums: number[]): Promise<void> {
  const logPrefix = "[syncReadChapters]";

  const entry = await findLibraryEntry(mangaId);
  const current = entry?.attributes.progress ?? 0;

  let target = Math.max(...chapterNums.map(toProgress));
  // Only ask for the chapter count when the write could happen at all.
  if (entry == null || target > current) {
    const { chapterCount } = await getMangaSummary(mangaId);
    if (chapterCount != null) {
      target = Math.min(target, chapterCount);
    }
  }

  if (entry != null && target <= current) {
    console.log(`${logPrefix} ${mangaId}: already at ${current}, nothing to do`);
    return;
  }

  console.log(
    entry != null
      ? `${logPrefix} ${mangaId}: ${current} -> ${target}`
      : `${logPrefix} ${mangaId}: adding to library at ${target}`,
  );
  await saveProgress(mangaId, target, entry?.id);
}
