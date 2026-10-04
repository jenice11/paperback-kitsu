import { type TestLogger } from "@paperback/types";

import { Kitsu } from "../Kitsu/main.js";
import sourceInfo from "../Kitsu/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("Kitsu tests", logger);
  //@ts-expect-error mixins error
  registerDefaultTests(suite, Kitsu, sourceInfo);

  await suite.run();
}
