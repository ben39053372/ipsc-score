import { CloudEventFunction, http } from "@google-cloud/functions-framework";
import { main } from "./functions/main";

export const getScore: CloudEventFunction = async (cloudEvent) => {
  await main();
};

http("getAllMatches", async (req, res) => {
  const result = await getAllMatches();
  res.json(result);
});
