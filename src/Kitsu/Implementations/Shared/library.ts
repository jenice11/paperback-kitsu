/* SPDX-License-Identifier: GPL-3.0-or-later */

import type {
  JsonApiDocument,
  LibraryEntryResource,
  LibraryStatus,
  MangaResource,
} from "../../Services/models";
import { makeRequest } from "../../Services/requests";
import { requireSession } from "../../Services/session";
import { parsePrimaryTitle, todayTimestamp } from "./parser";

/** The list a new entry lands on when none was picked: Currently reading once a chapter is read. */
export function newEntryStatus(progress = 0): LibraryStatus {
  return progress > 0 ? "current" : "planned";
}

/** The parts of a library entry the user can change. */
export interface LibraryChanges {
  progress?: number;
  status?: LibraryStatus;
  volumesOwned?: number;
  reconsumeCount?: number;
  /** Kitsu timestamps; null clears the date. */
  startedAt?: string | null;
  finishedAt?: string | null;
}

/**
 * Dates to add when a write moves a title onto a list: today as the start date
 * on Currently reading, today as the finish date on Completed. A date that is
 * already set, or that this write sets itself, is left alone. `before` is the
 * entry as it is now, undefined for a title that is not in the library.
 */
export function autoDates(
  before: Omit<LibraryChanges, "progress"> | undefined,
  changes: LibraryChanges,
): Pick<LibraryChanges, "startedAt" | "finishedAt"> {
  const status =
    changes.status ?? before?.status ?? newEntryStatus(changes.progress);
  if (status === before?.status) {
    return {};
  }
  if (
    status === "current" &&
    changes.startedAt === undefined &&
    !before?.startedAt
  ) {
    return { startedAt: todayTimestamp() };
  }
  if (
    status === "completed" &&
    changes.finishedAt === undefined &&
    !before?.finishedAt
  ) {
    return { finishedAt: todayTimestamp() };
  }
  return {};
}

// Kitsu library entries are keyed by user + media, hence the session's userId.
export async function findLibraryEntry(
  mangaId: string,
): Promise<LibraryEntryResource | undefined> {
  const { userId } = requireSession();
  const doc = await makeRequest<JsonApiDocument<LibraryEntryResource[]>>(
    "/library-entries",
    {
      query: {
        "filter[user_id]": userId,
        "filter[kind]": "manga",
        "filter[manga_id]": mangaId,
        "page[limit]": 1,
      },
    },
  );
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
      query: {
        "fields[manga]": "canonicalTitle,titles,abbreviatedTitles,chapterCount",
      },
    },
  );
  const { chapterCount } = doc.data.attributes;
  return {
    title: parsePrimaryTitle(doc.data.attributes),
    // Series that are still running have no known total.
    chapterCount:
      typeof chapterCount === "number" && chapterCount > 0
        ? chapterCount
        : undefined,
  };
}

/**
 * Writes `changes` to the user's library: updates entry `entryId`, or adds the
 * title (on the chosen list, else Plan to read, or Currently reading once a
 * chapter is read) when there is no entry yet. Returns the id of the entry that was written.
 */
export async function saveLibraryEntry(
  mangaId: string,
  entryId: string | undefined,
  changes: LibraryChanges,
): Promise<string> {
  if (entryId != null) {
    await makeRequest(`/library-entries/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      body: {
        data: {
          type: "libraryEntries",
          id: entryId,
          attributes: changes,
        },
      },
    });
    return entryId;
  }

  const { userId } = requireSession();
  const doc = await makeRequest<JsonApiDocument<LibraryEntryResource>>(
    "/library-entries",
    {
      method: "POST",
      body: {
        data: {
          type: "libraryEntries",
          attributes: {
            ...changes,
            status: changes.status ?? newEntryStatus(changes.progress),
            progress: changes.progress ?? 0,
          },
          relationships: {
            user: { data: { type: "users", id: userId } },
            media: { data: { type: "manga", id: mangaId } },
          },
        },
      },
    },
  );
  return doc.data.id;
}

/**
 * Kitsu progress is a whole number. Sources use decimals (10.5), zero
 * (prologues) and sometimes garbage; reduce all of that to a safe integer.
 */
function toProgress(chapterNum: number): number {
  return Number.isFinite(chapterNum) && chapterNum > 0
    ? Math.floor(chapterNum)
    : 0;
}

/**
 * Records that these chapters of one manga were read: the highest one becomes
 * the user's progress, but progress never goes down and never exceeds the
 * series' chapter count (Kitsu rejects anything higher).
 */
export async function syncReadChapters(
  mangaId: string,
  chapterNums: number[],
): Promise<void> {
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

  // Chapters read take a title off Plan to read; other lists are the user's choice.
  const status =
    entry == null
      ? newEntryStatus(target)
      : entry.attributes.status === "planned" && Math.max(target, current) > 0
        ? "current"
        : undefined;
  const advance = entry == null || target > current;

  if (!advance && status === undefined) {
    console.log(
      `${logPrefix} ${mangaId}: already at ${current}, nothing to do`,
    );
    return;
  }

  console.log(
    entry != null
      ? `${logPrefix} ${mangaId}: ${current} -> ${target}`
      : `${logPrefix} ${mangaId}: adding to library at ${target}`,
  );
  const changes: LibraryChanges = {};
  if (advance) {
    changes.progress = target;
  }
  if (status !== undefined) {
    changes.status = status;
  }
  await saveLibraryEntry(mangaId, entry?.id, {
    ...changes,
    ...autoDates(entry?.attributes, changes),
  });
}
