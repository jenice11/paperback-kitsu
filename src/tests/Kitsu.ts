import { type TestLogger } from "@paperback/types";

import { Kitsu } from "../Kitsu/main";
import sourceInfo from "../Kitsu/pbconfig";
import { TestSuite, registerDefaultTests } from "./suite";

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
