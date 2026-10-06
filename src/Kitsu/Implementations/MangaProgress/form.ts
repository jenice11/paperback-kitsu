/* SPDX-License-Identifier: GPL-3.0-or-later */

import { Form, LabelRow, Section, StepperRow } from "@paperback/types";

import { findLibraryEntry, getMangaSummary, saveProgress } from "../Shared/library";
import { errorText } from "../Shared/log";
import type { LibraryStatus } from "../Shared/models";

const STATUS_LABELS: Record<LibraryStatus, string> = {
  current: "Currently reading",
  planned: "Plan to read",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
};

export class MangaProgressForm extends Form {
  loading = true;
  error: Error | null = null;

  title = "";
  chapterCount: number | undefined;
  entryId: string | undefined;
  status: LibraryStatus | undefined;

  initialChapter = 0;
  chapter = 0;

  constructor(private readonly mangaId: string) {
    super();
  }

  override requiresExplicitSubmission = true;

  override formWillAppear(): void {
    void this.loadData();
  }

  override getSections() {
    if (this.loading) {
      return [Section("loading", [LabelRow("loading", { title: "Loading..." })])];
    }

    if (this.error != null) {
      return [
        Section("error", [
          LabelRow("error", { title: "Error", subtitle: String(this.error.message) }),
        ]),
      ];
    }

    return [
      Section({ id: "information", header: "Information" }, [
        LabelRow("title", { title: "Title", value: this.title }),
        LabelRow("status", {
          title: "Library status",
          value: this.status != null ? STATUS_LABELS[this.status] : "Not in your library",
        }),
      ]),
      Section(
        {
          id: "progress",
          header: "Progress",
          footer:
            this.entryId == null
              ? "Saving adds this title to your Kitsu library as currently reading."
              : "",
        },
        [
          StepperRow("chapter", {
            title: "Chapters",
            subtitle: "The highest read chapter number",
            value: this.chapter,
            minValue: 0,
            maxValue: this.chapterCount ?? 99999,
            stepValue: 1,
            loopOver: false,
            onValueChange: Application.Selector(this as MangaProgressForm, "setChapter"),
          }),
        ],
      ),
    ];
  }

  async setChapter(chapter: number): Promise<void> {
    this.chapter = chapter;
    this.reloadForm();
  }

  async loadData(): Promise<void> {
    const logPrefix = "[loadProgressData]";
    try {
      const [summary, entry] = await Promise.all([
        getMangaSummary(this.mangaId),
        findLibraryEntry(this.mangaId),
      ]);

      this.title = summary.title;
      this.chapterCount = summary.chapterCount;

      this.entryId = entry?.id;
      this.status = entry?.attributes.status;
      this.initialChapter = entry?.attributes.progress ?? 0;
      this.chapter = this.initialChapter;
      this.error = null;
    } catch (e) {
      console.log(`${logPrefix} failed: ${this.mangaId}`);
      console.log(errorText(e));
      this.error = e as Error;
    } finally {
      this.loading = false;
      this.reloadForm();
    }
  }

  override async formDidSubmit(): Promise<void> {
    const logPrefix = "[saveProgress]";
    if (this.chapter === this.initialChapter) {
      return;
    }

    try {
      console.log(`${logPrefix} ${this.mangaId}: ${this.initialChapter} -> ${this.chapter}`);
      await saveProgress(this.mangaId, this.chapter, this.entryId);
      this.initialChapter = this.chapter;
    } catch (e) {
      console.log(`${logPrefix} failed`);
      console.log(errorText(e));
      throw e;
    }
  }
}
