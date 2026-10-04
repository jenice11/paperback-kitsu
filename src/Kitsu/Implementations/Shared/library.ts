/* SPDX-License-Identifier: GPL-3.0-or-later */

import { makeRequest } from "../../Services/Requests";
import type { JsonApiDocument, LibraryEntryResource, MangaResource, UserResource } from "./models";
import { assertMustBeAuthenticated, getSession, setSession } from "./session";

/** Kitsu library entries are keyed by user + media, so we need the user's id. */
export async function getUserId(): Promise<string> {
  const session = assertMustBeAuthenticated();
  if (session.userId) {
    return session.userId;
  }

  const doc = await makeRequest<JsonApiDocument<UserResource[]>>("/users", {
    query: { "filter[self]": "true" },
  });
  const user = doc.data[0];
  if (user == null) {
    throw new Error("Could not load your Kitsu account");
  }

  setSession({
    ...(getSession() ?? session),
    userId: user.id,
    username: user.attributes.name ?? user.attributes.slug,
  });
  return user.id;
}

export async function findLibraryEntry(mangaId: string): Promise<LibraryEntryResource | undefined> {
  const userId = await getUserId();
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

/** `undefined` for series that are still running / have no known total. */
export async function getChapterCount(mangaId: string): Promise<number | undefined> {
  const doc = await makeRequest<JsonApiDocument<MangaResource>>(
    `/manga/${encodeURIComponent(mangaId)}`,
    { auth: "optional", query: { "fields[manga]": "chapterCount" } },
  );
  const count = doc.data.attributes.chapterCount;
  return typeof count === "number" && count > 0 ? count : undefined;
}

/**
 * Kitsu progress is a whole number. Sources use decimals (10.5), zero
 * (prologues) and sometimes garbage; reduce all of that to a safe integer.
 */
export function toProgress(chapterNum: number): number {
  return Number.isFinite(chapterNum) && chapterNum > 0 ? Math.floor(chapterNum) : 0;
}

/** Kitsu rejects progress beyond the series' chapter count. */
export function clampProgress(progress: number, chapterCount: number | undefined): number {
  return chapterCount != null ? Math.min(progress, chapterCount) : progress;
}

export async function createLibraryEntry(mangaId: string, progress: number): Promise<void> {
  const userId = await getUserId();
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

export async function updateLibraryEntryProgress(entryId: string, progress: number): Promise<void> {
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
}
