/* SPDX-License-Identifier: GPL-3.0-or-later */

import type {
  Chapter,
  ChapterReadActionQueueProcessingResult,
  Form,
  MangaProgress,
  SourceManga,
  TrackedMangaChapterReadAction,
} from "@paperback/types";

import { logError } from "../../Services/log";
import { requireSession } from "../../Services/session";
import { findLibraryEntry, syncReadChapters } from "../Shared/library";
import { MangaProgressForm } from "./form";

export async function getMangaProgressManagementForm(sourceManga: SourceManga): Promise<Form> {
  // Refuse up front rather than opening a form that can only show an error.
  requireSession();
  return new MangaProgressForm(sourceManga.mangaId);
}

export async function getMangaProgress(
  sourceManga: SourceManga,
): Promise<MangaProgress | undefined> {
  const entry = await findLibraryEntry(sourceManga.mangaId);
  if (entry == null) {
    return undefined;
  }

  const progress = entry.attributes.progress ?? 0;
  const lastReadChapter: Chapter = {
    chapterId: String(progress),
    sourceManga,
    langCode: "unknown",
    chapNum: progress,
  };

  const progressedAt = new Date(entry.attributes.progressedAt ?? NaN);
  const lastReadTime = isNaN(progressedAt.getTime()) ? undefined : progressedAt;

  return { sourceManga, lastReadChapter, lastReadTime };
}

export async function processChapterReadActionQueue(
  actions: TrackedMangaChapterReadAction[],
): Promise<ChapterReadActionQueueProcessingResult> {
  const logPrefix = "[processChapterReadActionQueue]";
  const successfulItems: string[] = [];
  const failedItems: string[] = [];
  console.log(`${logPrefix} start: ${actions.length} action(s)`);

  // Many chapters of one manga collapse into a single write.
  const byManga = new Map<string, TrackedMangaChapterReadAction[]>();
  for (const action of actions) {
    const key = action.sourceManga.mangaId;
    const group = byManga.get(key);
    if (group != null) {
      group.push(action);
    } else {
      byManga.set(key, [action]);
    }
  }

  // Kitsu has no bulk endpoint, so go one manga at a time. A failure only
  // affects that manga; its actions stay queued for a retry.
  for (const [mangaId, mangaActions] of byManga) {
    const ids = mangaActions.map((a) => a.id);
    try {
      await syncReadChapters(
        mangaId,
        mangaActions.map((a) => a.chapterNum),
      );
      successfulItems.push(...ids);
    } catch (e) {
      logError(`${logPrefix} failed for manga ${mangaId}`, e);
      failedItems.push(...ids);
    }
  }

  console.log(
    `${logPrefix} complete: ${successfulItems.length} succeeded, ${failedItems.length} failed`,
  );
  return { successfulItems, failedItems };
}
