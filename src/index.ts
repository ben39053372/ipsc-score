import { CloudEventFunction } from "@google-cloud/functions-framework";
import { main } from "./functions/main";
import { getAllMatches } from "./functions/getAllMatches";

export const getScore: CloudEventFunction = async (cloudEvent) => {
  await main();
};

export { getAllMatches } from "./functions/getAllMatches";
