import { CloudEventFunction } from "@google-cloud/functions-framework";
import { main } from "./functions/main";

export const getScore: CloudEventFunction = async (cloudEvent) => {
  await main();
};

export { getAllMatches } from "./functions/getAllMatches";
