import puppeteer from "puppeteer";
import fs from "fs";

import { promiseAllInBatches } from "./lib/promiseAllBatches";
import { genUrls, getData } from "./utils/crawlData";
import { calScore } from "./utils/calData";

const matchId = 105;

const lastShooterId = 258;

const stagesPoint = [60, 120, 160, 55, 80, 120, 155];

async function main() {
  console.log("run");
  console.log("crawl");
  console.log("matchId: ", matchId);
  console.log("lastShooterId: ", lastShooterId);
  console.time("crawl");

  const urls = genUrls(lastShooterId, matchId);

  const browser = await puppeteer.launch();

  const results = await promiseAllInBatches(
    urls.map((url, index) => async () => {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const html = await page.content();
      const result = getData(html, index);
      await page.close();
      return result;
    }),
    40
  );

  await browser.close();

  const failResult = results.filter((result) => {
    result.status === "rejected";
  });

  console.log("result fail count: ", failResult.length);
  console.timeEnd("crawl");

  const playerMarks = results
    .filter((result) => result.status === "fulfilled")
    .map((successResult) =>
      successResult.status === "fulfilled" ? successResult.value : undefined
    )
    .filter((i) => !!i);

  const standardOverallResult = calScore(
    playerMarks.filter((s) => s.div === "Standard"),
    stagesPoint
  );

  const openOverallResult = calScore(
    playerMarks.filter((s) => s.div === "Open"),
    stagesPoint
  );

  const productionOverallResult = calScore(
    playerMarks.filter((s) => s.div === "Production"),
    stagesPoint
  );

  const classicOverallResult = calScore(
    playerMarks.filter((s) => s.div === "Classic"),
    stagesPoint
  );

  const productionOpticsOverallResult = calScore(
    playerMarks.filter((s) => s.div === "Production Optics"),
    stagesPoint
  );

  // fs.writeFile(
  //   "standard_result.json",
  //   JSON.stringify(result, null, 2),
  //   (err) => {
  //     if (err) console.error(err);
  //   }
  // );

  // console.log("state max: ", stageMax);
}

main();
