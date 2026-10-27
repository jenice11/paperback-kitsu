/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  Form,
  InputRow,
  LabelRow,
  NavigationRow,
  Section,
  SelectForm,
  StepperRow,
  ToggleRow,
} from "@paperback/types";

import { logError } from "../../Services/log";
import {
  autoDates,
  findLibraryEntry,
  getMangaSummary,
  newEntryStatus,
  parseDateText,
  saveLibraryEntry,
  shouldAutoComplete,
  toDateText,
  type LibraryChanges,
} from "../Shared/library";
import type { LibraryStatus } from "../Shared/models/main";

// Running series have no known chapter total; give the stepper a high ceiling.
const MAX_CHAPTERS_WHEN_UNKNOWN = 99999;
// Volumes and rereads have no known limit.
const MAX_COUNT = 99999;

const STATUS_LABELS: Record<LibraryStatus, string> = {
  current: "Currently reading",
  planned: "Plan to read",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
};

// Record keys keep Kitsu's own order of lists.
const STATUS_ITEMS = Object.entries(STATUS_LABELS).map(([id, title]) => ({
  id,
  title,
}));

function isLibraryStatus(id: string): id is LibraryStatus {
  return Object.hasOwn(STATUS_LABELS, id);
}

// Paperback shows a row value on one line, so the full list lives on its own screen.
class AlternativeTitlesForm extends Form {
  constructor(private readonly titles: string[]) {
    super();
  }

  override getSections() {
    return [
      Section(
        { id: "titles" },
        this.titles.map((title, i) => LabelRow(`title${i}`, { title })),
      ),
    ];
  }
}

export class MangaProgressForm extends Form {
  override requiresExplicitSubmission = true;

  loading = true;
  error: Error | undefined;

  title = "";
  alternativeTitles: string[] = [];
  mangaFinished = false;
  mangaStatus: string | undefined;
  published: string | undefined;
  chapterCount: number | undefined;
  entryId: string | undefined;
  /** The list the user has picked; undefined until known or picked. */
  status: LibraryStatus | undefined;
  initialStatus: LibraryStatus | undefined;
  initialRating: number | null = null;
  rating: number | null = null;
  initialPrivate = false;
  isPrivate = false;
  initialNotes = "";
  notes = "";

  initialChapter = 0;
  chapter = 0;
  initialVolumes = 0;
  volumes = 0;
  initialRereads = 0;
  rereads = 0;

  // Dates are `YYYY-MM-DD` text the user types; Paperback forms have no date picker.
  initialStartedAt = "";
  startedAt = "";
  initialFinishedAt = "";
  finishedAt = "";

  private loaded = false;

  constructor(private readonly mangaId: string) {
    super();
  }

  override formWillAppear(): void {
    // The host shows the form again when a picker screen closes. Loading again
    // would throw away what the user just picked.
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    void this.loadData();
  }

  override getSections() {
    if (this.loading) {
      return [Section({ id: "loading" }, [LabelRow("loading", { title: "Loading..." })])];
    }

    if (this.error != null) {
      return [
        Section({ id: "error" }, [
          LabelRow("error", { title: "Error", subtitle: this.error.message }),
        ]),
      ];
    }

    return [
      Section({ id: "information", header: "Information" }, [
        LabelRow("title", { title: "Title", value: this.title }),
        ...(this.alternativeTitles.length > 0
          ? [
              NavigationRow("alternativeTitles", {
                title: "Alternative titles",
                value: `${this.alternativeTitles.length} ${this.alternativeTitles.length === 1 ? "title" : "titles"}`,
                form: new AlternativeTitlesForm(this.alternativeTitles),
              }),
            ]
          : []),
        ...(this.mangaStatus
          ? [LabelRow("mangaStatus", { title: "Status", value: this.mangaStatus })]
          : []),
        ...(this.published
          ? [LabelRow("published", { title: "Published", value: this.published })]
          : []),
      ]),
      Section(
        {
          id: "library",
          header: "Library",
          footer:
            this.entryId == null
              ? `Not in your library yet. Pick a list, or saving with a chapter read adds it as ${STATUS_LABELS.current}, otherwise as ${STATUS_LABELS.planned}.`
              : "",
        },
        [
          // Like SelectRow, but nothing is selected while the title has no list.
          NavigationRow("status", {
            title: "List",
            value: this.status != null ? STATUS_LABELS[this.status] : "Not selected",
            form: new SelectForm("List", {
              title: "List",
              value: this.status != null ? [this.status] : [],
              // The picker refuses to open with fewer values than this.
              minItemCount: this.status != null ? 1 : 0,
              maxItemCount: 1,
              layout: "list",
              items: STATUS_ITEMS,
              onValueChange: Application.Selector(this as MangaProgressForm, "setStatus"),
            }),
          }),
          StepperRow("rating", {
            title: "Rating",
            value: (this.rating ?? 0) / 2,
            minValue: 0,
            maxValue: 10,
            stepValue: 1,
            loopOver: false,
            onValueChange: Application.Selector(this as MangaProgressForm, "setRating"),
          }),
          ToggleRow("private", {
            title: "Private",
            value: this.isPrivate,
            onValueChange: Application.Selector(this as MangaProgressForm, "setPrivate"),
          }),
        ],
      ),
      Section({ id: "progress", header: "Progress" }, [
        StepperRow("chapter", {
          title: "Chapters",
          subtitle: "The highest read chapter number",
          value: this.chapter,
          minValue: 0,
          maxValue: this.chapterCount ?? MAX_CHAPTERS_WHEN_UNKNOWN,
          stepValue: 1,
          loopOver: false,
          onValueChange: Application.Selector(this as MangaProgressForm, "setChapter"),
        }),
        StepperRow("volumes", {
          title: "Volumes owned",
          subtitle: "The number of volumes you own",
          value: this.volumes,
          minValue: 0,
          maxValue: MAX_COUNT,
          stepValue: 1,
          loopOver: false,
          onValueChange: Application.Selector(this as MangaProgressForm, "setVolumes"),
        }),
        StepperRow("rereads", {
          title: "Reread count",
          subtitle: "The amount of times you have reread the title",
          value: this.rereads,
          minValue: 0,
          maxValue: MAX_COUNT,
          stepValue: 1,
          loopOver: false,
          onValueChange: Application.Selector(this as MangaProgressForm, "setRereads"),
        }),
      ]),
      Section(
        {
          id: "dates",
          header: "Dates",
          footer: "Type YYYY-MM-DD. Leave empty for no date.",
        },
        [
          InputRow("startedAt", {
            title: "Started",
            value: this.startedAt,
            onValueChange: Application.Selector(this as MangaProgressForm, "setStartedAt"),
          }),
          InputRow("finishedAt", {
            title: "Finished",
            value: this.finishedAt,
            onValueChange: Application.Selector(this as MangaProgressForm, "setFinishedAt"),
          }),
        ],
      ),
      Section({ id: "notes", header: "Notes" }, [
        InputRow("notes", {
          title: "Notes",
          value: this.notes,
          onValueChange: Application.Selector(this as MangaProgressForm, "setNotes"),
        }),
      ]),
    ];
  }

  async setChapter(chapter: number): Promise<void> {
    this.chapter = chapter;
    this.reloadForm();
  }

  async setVolumes(volumes: number): Promise<void> {
    this.volumes = volumes;
    this.reloadForm();
  }

  async setPrivate(value: boolean): Promise<void> {
    this.isPrivate = value;
    this.reloadForm();
  }

  async setNotes(value: string): Promise<void> {
    this.notes = value;
    this.reloadForm();
  }

  async setRereads(rereads: number): Promise<void> {
    this.rereads = rereads;
    this.reloadForm();
  }

  async setStartedAt(value: string): Promise<void> {
    this.startedAt = value;
  }

  async setFinishedAt(value: string): Promise<void> {
    this.finishedAt = value;
  }

  async setStatus(value: string[]): Promise<void> {
    const [id] = value;
    if (id != null && isLibraryStatus(id)) {
      this.status = id;
    }
    this.reloadForm();
  }

  async setRating(value: number): Promise<void> {
    // Kitsu stores a rating as 2 to 20 and shows it as 1 to 10; 0 clears it.
    const ratingTwenty = Math.min(Math.round(value * 2), 20);
    this.rating = ratingTwenty >= 2 ? ratingTwenty : null;
    this.reloadForm();
  }

  private async loadData(): Promise<void> {
    const logPrefix = "[loadProgressData]";
    try {
      const [summary, entry] = await Promise.all([
        getMangaSummary(this.mangaId),
        findLibraryEntry(this.mangaId),
      ]);

      this.title = summary.title;
      this.alternativeTitles = summary.alternativeTitles;
      this.mangaStatus = summary.status;
      this.published = summary.published;
      this.chapterCount = summary.chapterCount;
      this.mangaFinished = summary.finished;

      this.entryId = entry?.id;
      this.status = entry?.attributes.status;
      this.initialStatus = this.status;
      this.initialRating = entry?.attributes.ratingTwenty ?? null;
      this.rating = this.initialRating;
      this.initialPrivate = entry?.attributes.private ?? false;
      this.isPrivate = this.initialPrivate;
      this.initialNotes = entry?.attributes.notes ?? "";
      this.notes = this.initialNotes;
      this.initialChapter = entry?.attributes.progress ?? 0;
      this.chapter = this.initialChapter;
      this.initialVolumes = entry?.attributes.volumesOwned ?? 0;
      this.volumes = this.initialVolumes;
      this.initialRereads = entry?.attributes.reconsumeCount ?? 0;
      this.rereads = this.initialRereads;
      this.initialStartedAt = toDateText(entry?.attributes.startedAt);
      this.startedAt = this.initialStartedAt;
      this.initialFinishedAt = toDateText(entry?.attributes.finishedAt);
      this.finishedAt = this.initialFinishedAt;
      this.error = undefined;
    } catch (e) {
      logError(`${logPrefix} failed: ${this.mangaId}`, e);
      this.error = e instanceof Error ? e : new Error(String(e));
    } finally {
      this.loading = false;
      this.reloadForm();
    }
  }

  override async formDidSubmit(): Promise<void> {
    const logPrefix = "[saveLibraryEntry]";

    const changes: LibraryChanges = {};
    if (this.chapter !== this.initialChapter) {
      changes.progress = this.chapter;
    }
    if (this.volumes !== this.initialVolumes) {
      changes.volumesOwned = this.volumes;
    }
    if (this.rereads !== this.initialRereads) {
      changes.reconsumeCount = this.rereads;
    }
    if (this.status != null && this.status !== this.initialStatus) {
      changes.status = this.status;
    }
    if (this.rating !== this.initialRating) {
      changes.ratingTwenty = this.rating;
    }
    if (this.isPrivate !== this.initialPrivate) {
      changes.private = this.isPrivate;
    }
    if (this.notes.trim() !== this.initialNotes.trim()) {
      changes.notes = this.notes.trim() === "" ? null : this.notes.trim();
    }
    // Parsing throws on a bad date, before anything is sent.
    if (this.startedAt.trim() !== this.initialStartedAt) {
      changes.startedAt = parseDateText(this.startedAt);
    }
    if (this.finishedAt.trim() !== this.initialFinishedAt) {
      changes.finishedAt = parseDateText(this.finishedAt);
    }
    if (Object.keys(changes).length === 0) {
      return;
    }

    // Kitsu may have changed since the form opened: use its entry as it is now.
    const latest = await findLibraryEntry(this.mangaId);
    this.entryId = latest?.id;
    // Last chapter of a finished series saved with no list picked: Completed.
    if (
      changes.status === undefined &&
      changes.progress !== undefined &&
      shouldAutoComplete(latest?.attributes.status, changes.progress, {
        finished: this.mangaFinished,
        chapterCount: this.chapterCount,
      })
    ) {
      changes.status = "completed";
    }
    Object.assign(changes, autoDates(latest?.attributes, changes));

    console.log(`${logPrefix} ${this.mangaId}: ${JSON.stringify(changes)}`);
    // makeRequest logs failures itself; the host shows the thrown error.
    this.entryId = await saveLibraryEntry(this.mangaId, this.entryId, changes);
    this.initialChapter = this.chapter;
    this.initialVolumes = this.volumes;
    this.initialRereads = this.rereads;
    // A new entry went onto the default list when no other was picked.
    this.status = changes.status ?? this.status ?? newEntryStatus(changes.progress);
    this.initialStatus = this.status;
    this.initialRating = this.rating;
    this.initialPrivate = this.isPrivate;
    this.initialNotes = this.notes;
    // Show dates as Kitsu has them now, filled-in ones included.
    if (changes.startedAt !== undefined) {
      this.startedAt = toDateText(changes.startedAt);
    }
    if (changes.finishedAt !== undefined) {
      this.finishedAt = toDateText(changes.finishedAt);
    }
    this.initialStartedAt = this.startedAt;
    this.initialFinishedAt = this.finishedAt;
  }
}
