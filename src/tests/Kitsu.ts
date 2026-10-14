import { type TestLogger } from "@paperback/types";

import { Kitsu } from "../Kitsu/main.js";
import sourceInfo from "../Kitsu/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Kitsu tests", logger);
  // The default search sends an empty title, which this extension answers with
  // no results. Search for a real title so the search and details tests have
  // something to work with.
  registerDefaultTests(suite, Kitsu, sourceInfo, {
    searchResultsProviding: {
      getSearchResults: [{ title: "One Piece" }, undefined, undefined],
    },
  });

  await suite.run();
}
