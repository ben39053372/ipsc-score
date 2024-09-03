import puppeteer from "puppeteer";
import { genUrls, getData } from "../utils/crawlData";
import { promiseAllInBatches } from "../lib/promiseAllBatches";
import { calScore } from "../utils/calData";
import { uploadJson } from "../utils/uploadJson";

// const matchId = 127;

// const lastShooterId = 232;

// // paper 10, pp 5,
// const stagesPoint = [160, 120, 50, 150, 50, 110];

export async function main(
  matchId: number,
  lastShooterId: number = 250,
  stagesPoint: number[]
) {
  console.log("run");
  console.log("crawl");
  console.log("matchId: ", matchId);
  console.log("lastShooterId: ", lastShooterId);
  console.log("stagesPoint: ", stagesPoint);
  console.time("crawl");

  const urls = genUrls(lastShooterId, matchId);

  const browser = await puppeteer.launch({ timeout: 0 });

  const results = await promiseAllInBatches(
    urls.map((url, index) => async () => {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
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

  const filters = {
    // standard
    standardOverAll: (s: PlayerMark) => s.div === "Standard",
    standardLady: (s: PlayerMark) => s.div === "Standard" && s.cat === "Lady",
    standardJunior: (s: PlayerMark) =>
      s.div === "Standard" && s.cat === "Junior",
    standardSenior: (s: PlayerMark) =>
      s.div === "Standard" && s.cat === "Senior",
    standardSuperJunior: (s: PlayerMark) =>
      s.div === "Standard" && s.cat === "S. Junior",
    standardSuperSenior: (s: PlayerMark) =>
      s.div === "Standard" && s.cat === "S. Senior",
    // open
    openOverAll: (s: PlayerMark) => s.div === "Open",
    openLady: (s: PlayerMark) => s.div === "Open" && s.cat === "Lady",
    openJunior: (s: PlayerMark) => s.div === "Open" && s.cat === "Junior",
    openSenior: (s: PlayerMark) => s.div === "Open" && s.cat === "Senior",
    openSuperJunior: (s: PlayerMark) =>
      s.div === "Open" && s.cat === "S. Junior",
    openSuperSenior: (s: PlayerMark) =>
      s.div === "Open" && s.cat === "S. Senior",
    // production
    productionOverAll: (s: PlayerMark) => s.div === "Production",
    productionLady: (s: PlayerMark) =>
      s.div === "Production" && s.cat === "Lady",
    productionJunior: (s: PlayerMark) =>
      s.div === "Production" && s.cat === "Junior",
    productionSenior: (s: PlayerMark) =>
      s.div === "Production" && s.cat === "Senior",
    productionSuperJunior: (s: PlayerMark) =>
      s.div === "Production" && s.cat === "S. Junior",
    productionSuperSenior: (s: PlayerMark) =>
      s.div === "Production" && s.cat === "S. Senior",
    // production optics
    productionOpticsOverAll: (s: PlayerMark) => s.div === "Production Optics",
    productionOpticsLady: (s: PlayerMark) =>
      s.div === "Production Optics" && s.cat === "Lady",
    productionOpticsJunior: (s: PlayerMark) =>
      s.div === "Production Optics" && s.cat === "Junior",
    productionOpticsSenior: (s: PlayerMark) =>
      s.div === "Production Optics" && s.cat === "Senior",
    productionOpticsSuperJunior: (s: PlayerMark) =>
      s.div === "Production Optics" && s.cat === "S. Junior",
    productionOpticsSuperSenior: (s: PlayerMark) =>
      s.div === "Production Optics" && s.cat === "S. Senior",
    // classic
    classicOverAll: (s: PlayerMark) => s.div === "Classic",
    classicLady: (s: PlayerMark) => s.div === "Classic" && s.cat === "Lady",
    classicJunior: (s: PlayerMark) => s.div === "Classic" && s.cat === "Junior",
    classicSenior: (s: PlayerMark) => s.div === "Classic" && s.cat === "Senior",
    classicSuperJunior: (s: PlayerMark) =>
      s.div === "Classic" && s.cat === "S. Junior",
    classicSuperSenior: (s: PlayerMark) =>
      s.div === "Classic" && s.cat === "S. Senior",
  };

  const result = Object.entries(filters)
    .map(([key, filter]): [string, PlayerMarkWithScore[]] => {
      return [key, calScore(playerMarks.filter(filter), stagesPoint)];
    })
    .reduce((prev, curr) => {
      const result = prev;
      result[curr[0]] = curr[1];
      return result;
    }, {});

  await uploadJson(
    `result-${matchId}.json`,
    JSON.stringify(result, null, 2)
  ).catch(console.error);
}
