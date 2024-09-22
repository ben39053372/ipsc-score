import { CloudEventFunction, http } from "@google-cloud/functions-framework";
import { main } from "./functions/main";
import { getAllMatches } from "./functions/getAllMatches";

interface CloudEventData {
  attributes: {
    matchId: number;
    lastShooterId: number;
    stagesPoint: number[];
  };
}

export const getScore: CloudEventFunction = async (cloudEvent) => {
  console.log(cloudEvent);
  console.log(cloudEvent.attributes);
  const attr = (cloudEvent.data as CloudEventData).attributes;
  if (!attr.lastShooterId && !attr.matchId && !attr.stagesPoint) {
    console.error("missing attributes");
    return;
  }
  await main(attr.matchId, attr.lastShooterId, attr.stagesPoint);
};

http("getAllMatches", async (req, res) => {
  const result = await getAllMatches();
  res.json(result);
});
