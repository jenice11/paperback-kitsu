// Self-check for the date helpers and the automatic dates. Run:
//   npx rolldown src/tests/dates.ts --platform node --file /tmp/dates.mjs && node /tmp/dates.mjs
import { expect } from "chai";

import { autoDates } from "../Kitsu/Implementations/Shared/library";
import { parseDateText, toDateText, todayTimestamp } from "../Kitsu/Implementations/Shared/parser";

expect(toDateText("2024-05-01T12:34:56.000Z")).to.equal("2024-05-01");
expect(toDateText(null)).to.equal("");
expect(toDateText(undefined)).to.equal("");

expect(parseDateText("")).to.equal(null);
expect(parseDateText("   ")).to.equal(null);
expect(parseDateText(" 2026-02-28 ")).to.equal("2026-02-28T00:00:00.000Z");
expect(parseDateText("2024-02-29")).to.equal("2024-02-29T00:00:00.000Z");
for (const bad of ["2026-02-31", "2025-02-29", "2026-13-01", "2026-1-5", "tomorrow"]) {
  expect(() => parseDateText(bad), bad).to.throw();
}

const today = todayTimestamp();
expect(today).to.match(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
expect(toDateText(today)).to.equal(new Date().toLocaleDateString("en-CA"));
expect(parseDateText(toDateText(today))).to.equal(today);

// Today goes in only when a write moves the title onto Currently reading or
// Completed, and only if that date is empty and this write does not set it.
const old = "2020-01-02T00:00:00.000Z";
expect(autoDates(undefined, {})).to.deep.equal({ startedAt: today });
expect(autoDates(undefined, { status: "planned" })).to.deep.equal({});
expect(autoDates(undefined, { status: "completed" })).to.deep.equal({ finishedAt: today });
expect(autoDates(undefined, { status: "current", startedAt: old })).to.deep.equal({});
expect(autoDates(undefined, { status: "current", startedAt: null })).to.deep.equal({});
expect(autoDates({ status: "planned", startedAt: null }, { status: "current" })).to.deep.equal({
  startedAt: today,
});
expect(autoDates({ status: "planned", startedAt: old }, { status: "current" })).to.deep.equal({});
expect(autoDates({ status: "current" }, { progress: 3 })).to.deep.equal({});
expect(autoDates({ status: "current", finishedAt: null }, { status: "completed" })).to.deep.equal({
  finishedAt: today,
});
expect(autoDates({ status: "completed", finishedAt: old }, { status: "dropped" })).to.deep.equal(
  {},
);

console.log("dates ok");
