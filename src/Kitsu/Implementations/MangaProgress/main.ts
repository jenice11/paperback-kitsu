/* SPDX-License-Identifier: GPL-3.0-or-later */

import type {
  Chapter,
  ChapterReadActionQueueProcessingResult,
  Form,
  MangaProgress,
  MangaProgressProviding,
  SourceManga,
  TrackedMangaChapterReadAction,
} from "@paperback/types";

import {
  clampProgress,
  createLibraryEntry,
  findLibraryEntry,
  getChapterCount,
  toProgress,
  updateLibraryEntryProgress,
} from "../Shared/library";
import { errorText } from "../Shared/log";
import { assertMustBeAuthenticated } from "../Shared/session";
import { MangaProgressForm } from "./form";

export class MangaProgressImplementation implements MangaProgressProviding {
  async getMangaProgressManagementForm(sourceManga: SourceManga): Promise<Form> {
    assertMustBeAuthenticated();
    return new MangaProgressForm(sourceManga.mangaId);
  }

  async getMangaProgress(sourceManga: SourceManga): Promise<MangaProgress | undefined> {
    assertMustBeAuthenticated();

    const logPrefix = "[getMangaProgress]";
    console.log(`${logPrefix} start: ${sourceManga.mangaId}`);

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

    const progressedAt = entry.attributes.progressedAt
      ? new Date(entry.attributes.progressedAt)
      : undefined;
    const lastReadTime =
      progressedAt != null && !isNaN(progressedAt.getTime()) ? progressedAt : undefined;

    console.log(`${logPrefix} complete: ${sourceManga.mangaId} -> chapter ${progress}`);
    return { sourceManga, lastReadChapter, lastReadTime };
  }

  async processChapterReadActionQueue(
    actions: TrackedMangaChapterReadAction[],
  ): Promise<ChapterReadActionQueueProcessingResult> {
    const logPrefix = "[processChapterReadActionQueue]";
    const successfulItems: string[] = [];
    const failedItems: string[] = [];
    console.log(`${logPrefix} start: ${actions.length} action(s)`);

    try {
      assertMustBeAuthenticated();
    } catch (e) {
      console.log(`${logPrefix} not logged in`);
      console.log(errorText(e));
      return { successfulItems, failedItems: actions.map((a) => a.id) };
    }

    // Many chapters of one manga collapse into a single write.
    const byManga = new Map<string, TrackedMangaChapterReadAction[]>();
    for (const action of actions) {
      const key = action.sourceManga.mangaId;
      byManga.set(key, [...(byManga.get(key) ?? []), action]);
    }

    // Kitsu has no bulk endpoint, so go one manga at a time. A failure only
    // affects that manga; its actions stay queued for a retry.
    for (const [mangaId, mangaActions] of byManga) {
      const ids = mangaActions.map((a) => a.id);
      try {
        await this.syncManga(mangaId, mangaActions);
        successfulItems.push(...ids);
      } catch (e) {
        console.log(`${logPrefix} failed for manga ${mangaId}`);
        console.log(errorText(e));
        failedItems.push(...ids);
      }
    }

    console.log(
      `${logPrefix} complete: ${successfulItems.length} succeeded, ${failedItems.length} failed`,
    );
    return { successfulItems, failedItems };
  }

  private async syncManga(
    mangaId: string,
    actions: TrackedMangaChapterReadAction[],
  ): Promise<void> {
    const logPrefix = "[syncManga]";

    const entry = await findLibraryEntry(mangaId);
    const current = entry?.attributes.progress ?? 0;

    let target = Math.max(...actions.map((a) => toProgress(a.chapterNum)));
    // Never decrease a user's progress by replaying an old chapter.
    if (entry != null && target <= current) {
      console.log(`${logPrefix} ${mangaId}: already at ${current}, nothing to do`);
      return;
    }

    target = clampProgress(target, await getChapterCount(mangaId));
    if (entry != null) {
      if (target <= current) {
        console.log(`${logPrefix} ${mangaId}: already at ${current}, nothing to do`);
        return;
      }
      console.log(`${logPrefix} ${mangaId}: ${current} -> ${target}`);
      await updateLibraryEntryProgress(entry.id, target);
    } else {
      console.log(`${logPrefix} ${mangaId}: adding to library at ${target}`);
      await createLibraryEntry(mangaId, target);
    }
  }
}
