// Plays the Paperback host against MangaProgressForm: a fake Kitsu, and the form
// shown again after the user comes back from a picker screen. Run:
//   npx rolldown src/tests/progressForm.ts --platform node --file /tmp/progressForm.mjs && node /tmp/progressForm.mjs
import type { Form, Request } from "@paperback/types";
import { expect } from "chai";

import { MangaProgressForm } from "../Kitsu/Implementations/MangaProgress/form.js";
import { syncReadChapters, todayTimestamp } from "../Kitsu/Implementations/Shared/library.js";

const entry = (status: string, dates: object = {}) => ({
  id: "e1",
  type: "libraryEntries",
  attributes: { status, progress: 5, ...dates },
});
const today = todayTimestamp();
const OLD = "2020-01-02T00:00:00.000Z";
const URL_ENTRIES = "https://kitsu.app/api/edge/library-entries";

function startHost(entry: object | undefined): Request[] {
  const sent: Request[] = [];
  Object.assign(globalThis, {
    Application: {
      Selector: (_target: unknown, name: string) => name,
      getSecureState: () =>
        JSON.stringify({
          accessToken: "a",
          refreshToken: "r",
          expiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000,
          userId: "u1",
        }),
      setSecureState: () => undefined,
      arrayBufferToUTF8String: (text: string) => text,
      scheduleRequest: async (request: Request) => {
        sent.push(request);
        let body: object = { data: {} };
        if (request.method === "GET" && request.url.includes("/library-entries")) {
          body = { data: entry ? [entry] : [] };
        } else if (request.method === "GET" && request.url.includes("/manga/")) {
          body = {
            data: {
              id: "m1",
              type: "manga",
              attributes: {
                canonicalTitle: "Test",
                titles: {},
                chapterCount: 100,
              },
            },
          };
        } else if (request.method === "POST") {
          body = { data: { id: "new1" } };
        }
        return [{ status: 200 }, JSON.stringify(body)];
      },
    },
  });
  return sent;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function open(): Promise<MangaProgressForm> {
  const form = new MangaProgressForm("m1");
  form.formWillAppear();
  await settle();
  return form;
}

/** The host shows the form again when the user comes back from a picker screen. */
async function comeBack(form: MangaProgressForm): Promise<void> {
  form.formWillAppear();
  await settle();
}

function writes(sent: Request[]): { method: string; url: string; attributes: object }[] {
  return sent
    .filter((r) => r.method === "PATCH" || r.method === "POST")
    .map((r) => ({
      method: r.method,
      url: r.url,
      attributes: (JSON.parse(r.body as string) as { data: { attributes: object } }).data
        .attributes,
    }));
}

function statusRow(form: MangaProgressForm): { value?: unknown; form: Form } {
  for (const section of form.getSections()) {
    for (const row of (
      section as unknown as {
        items: { id: string; value?: unknown; form: Form }[];
      }
    ).items) {
      if (row.id === "status") {
        return row;
      }
    }
  }
  throw new Error("no status row");
}

/** Taps the List row: the host builds the picker screen, which checks its own settings. */
function openList(form: MangaProgressForm): void {
  statusRow(form).form.getSections();
}

// In the library: pick a list, come back, submit -> the list is saved, nothing else.
{
  const sent = startHost(entry("current"));
  const form = await open();
  expect(statusRow(form).value).to.equal("Currently reading");
  openList(form);
  await form.setStatus(["planned"]);
  await comeBack(form);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { status: "planned" },
    },
  ]);
}

// Not in the library: no list is selected until the user picks one.
{
  const sent = startHost(undefined);
  const form = await open();
  expect(statusRow(form).value).to.equal("Not selected");
  openList(form);
  await form.setStatus(["planned"]);
  await comeBack(form);
  expect(statusRow(form).value).to.equal("Plan to read");
  openList(form);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "POST",
      url: URL_ENTRIES,
      attributes: { status: "planned", progress: 0 },
    },
  ]);
}

// Not in the library, no list picked, chapter read: Currently reading, started today.
{
  const sent = startHost(undefined);
  const form = await open();
  await form.setChapter(3);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "POST",
      url: URL_ENTRIES,
      attributes: { progress: 3, status: "current", startedAt: today },
    },
  ]);
}

// Volumes owned and reread count: only what changed is sent, and a second Done sends nothing.
{
  const sent = startHost({
    ...entry("current", { startedAt: OLD }),
    attributes: {
      status: "current",
      progress: 5,
      startedAt: OLD,
      volumesOwned: 2,
      reconsumeCount: 1,
    },
  });
  const form = await open();
  expect(form.volumes).to.equal(2);
  expect(form.rereads).to.equal(1);
  await form.setVolumes(3);
  await form.formDidSubmit();
  await form.setRereads(2);
  await form.formDidSubmit();
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { volumesOwned: 3 },
    },
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { reconsumeCount: 2 },
    },
  ]);
}

// Picking Completed fills an empty finish date; picking Currently reading an empty start date.
{
  const sent = startHost(entry("planned"));
  const form = await open();
  await form.setStatus(["completed"]);
  await comeBack(form);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { status: "completed", finishedAt: today },
    },
  ]);
}
{
  const sent = startHost(entry("planned"));
  const form = await open();
  await form.setStatus(["current"]);
  await comeBack(form);
  await form.formDidSubmit();
  expect(writes(sent)[0]?.attributes).to.deep.equal({
    status: "current",
    startedAt: today,
  });
}
// A date that is already set stays.
{
  const sent = startHost(entry("planned", { startedAt: OLD }));
  const form = await open();
  await form.setStatus(["current"]);
  await form.formDidSubmit();
  expect(writes(sent)[0]?.attributes).to.deep.equal({ status: "current" });
}

// Typed dates survive coming back, and an empty field clears the date.
{
  const sent = startHost(entry("current", { finishedAt: OLD }));
  const form = await open();
  await form.setStartedAt(" 2026-01-02 ");
  await form.setFinishedAt("");
  await comeBack(form);
  await form.formDidSubmit();
  expect(writes(sent)[0]?.attributes).to.deep.equal({
    startedAt: "2026-01-02T00:00:00.000Z",
    finishedAt: null,
  });
}

// A half-typed date is refused before anything is sent, like any bad date.
{
  const sent = startHost(entry("current"));
  const form = await open();
  await form.setFinishedAt("202601");
  let message = "";
  try {
    await form.formDidSubmit();
  } catch (e) {
    message = e instanceof Error ? e.message : "";
  }
  expect(message).to.contain("is not a date");
  expect(writes(sent)).to.have.length(0);
}

// Junk over a saved date is refused on Done: nothing sent, the text is left as typed,
// and a good date typed afterwards saves.
{
  const sent = startHost(entry("current", { startedAt: OLD }));
  const form = await open();
  await form.setStartedAt("2026-12-cx");
  expect(form.startedAt).to.equal("2026-12-cx");
  let message = "";
  try {
    await form.formDidSubmit();
  } catch (e) {
    message = e instanceof Error ? e.message : "";
  }
  expect(message).to.contain("is not a date");
  expect(writes(sent)).to.have.length(0);
  expect(form.startedAt).to.equal("2026-12-cx");
  await form.setStartedAt("2026-12-05");
  await form.formDidSubmit();
  expect(writes(sent)[0]?.attributes).to.deep.equal({
    startedAt: "2026-12-05T00:00:00.000Z",
  });
}

// A bad date is refused before anything is sent.
{
  const sent = startHost(entry("current"));
  const form = await open();
  await form.setStartedAt("2026-02-31");
  let message = "";
  try {
    await form.formDidSubmit();
  } catch (e) {
    message = e instanceof Error ? e.message : "";
  }
  expect(message).to.contain("is not a date");
  expect(writes(sent)).to.have.length(0);
}

// Reading a chapter adds a new title as Currently reading, started today.
{
  const sent = startHost(undefined);
  await syncReadChapters("m1", [1, 2, 3]);
  expect(writes(sent)).to.deep.equal([
    {
      method: "POST",
      url: URL_ENTRIES,
      attributes: { progress: 3, status: "current", startedAt: today },
    },
  ]);
}
// Chapter 0 only (a prologue) adds it as Plan to read, progress 0.
{
  const sent = startHost(undefined);
  await syncReadChapters("m1", [0]);
  expect(writes(sent)).to.deep.equal([
    {
      method: "POST",
      url: URL_ENTRIES,
      attributes: { progress: 0, status: "planned" },
    },
  ]);
}
// An entry already Currently reading, On hold or Dropped keeps its list and dates.
for (const status of ["current", "on_hold", "dropped"]) {
  const sent = startHost(entry(status));
  await syncReadChapters("m1", [7]);
  expect(writes(sent)).to.deep.equal([
    { method: "PATCH", url: `${URL_ENTRIES}/e1`, attributes: { progress: 7 } },
  ]);
}
// Plan to read moves to Currently reading, started today, when a chapter moves progress...
{
  const sent = startHost(entry("planned"));
  await syncReadChapters("m1", [7]);
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { progress: 7, status: "current", startedAt: today },
    },
  ]);
}
// ...and also when Kitsu already holds progress and the chapter read is not higher.
{
  const sent = startHost(entry("planned"));
  await syncReadChapters("m1", [3]);
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { status: "current", startedAt: today },
    },
  ]);
}
// Plan to read with no progress and no chapter read stays where it is.
{
  const sent = startHost({
    ...entry("planned"),
    attributes: { status: "planned", progress: 0 },
  });
  await syncReadChapters("m1", [0]);
  expect(writes(sent)).to.have.length(0);
}

// Done asks Kitsu for the entry first: one made elsewhere since the form opened is
// updated, never added a second time, and its list decides the date rule.
{
  startHost(undefined);
  const form = await open();
  const sent = startHost(entry("planned"));
  await form.setChapter(2);
  await form.setStatus(["current"]);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "PATCH",
      url: `${URL_ENTRIES}/e1`,
      attributes: { progress: 2, status: "current", startedAt: today },
    },
  ]);
}
// A new entry with no chapter and no list picked goes on Plan to read.
{
  const sent = startHost(undefined);
  const form = await open();
  await form.setVolumes(2);
  await form.formDidSubmit();
  expect(writes(sent)).to.deep.equal([
    {
      method: "POST",
      url: URL_ENTRIES,
      attributes: { volumesOwned: 2, status: "planned", progress: 0 },
    },
  ]);
}

console.log("progress form ok");
