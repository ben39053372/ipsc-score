import puppeteer from "puppeteer";
import jsdom from "jsdom";

const matchId = 105;

const lastShooterId = 258;

const stagesPoint = [60, 120, 90, 55, 80, 120, 155];

async function promiseAllInBatches<T>(
  list: (() => Promise<T>)[],
  batchSize: number
) {
  let position = 0;
  let results: PromiseSettledResult<Awaited<T>>[] = [];
  while (position < list.length) {
    console.log("position:", position);
    const itemsForBatch = list.slice(position, position + batchSize);
    console.log(itemsForBatch);
    results = [
      ...results,
      ...(await Promise.allSettled(itemsForBatch.map((item) => item()))),
    ];
    position += batchSize;
    await new Promise((r) => setTimeout(r, 1));
  }

  return results;
}

function getData(html: string, index: number) {
  const dom = new jsdom.JSDOM(html);

  if (html.length <= 150) {
    console.error("502 bad gateway");
  }

  const name = dom.window.document.querySelector(
    "body > div > form > div.row.mt-6.p-2 > div.col-4"
  )?.innerHTML;

  const info = dom.window.document.querySelector(
    "body > div > form > div.row.mt-6.p-2 > .text-right"
  )?.innerHTML;

  if (!info) {
    console.log(html);
  }

  const tableRowNodeList = dom.window.document.querySelectorAll(
    "body > div > form > table tr"
  );

  const rows = Array.from(tableRowNodeList)
    .map((row) => {
      const td = row.querySelectorAll("td");
      return {
        stage: /\d+/.exec(td[0]?.innerHTML)?.[0],
        factor: td[1]?.innerHTML,
        pts: td[2]?.innerHTML,
        a: td[3]?.innerHTML,
        c: td[4]?.innerHTML,
        d: td[5]?.innerHTML,
        mi: td[6]?.innerHTML,
        ns: td[7]?.innerHTML,
        pe: td[8]?.innerHTML,
        time: td[10]?.innerHTML,
      };
    })
    .slice(1);

  // console.log(`${index}: ${JSON.stringify({ info })}`);

  return {
    id: index + 1,
    name: /[a-zA-Z,\s]+/g
      .exec(name?.replace("\n", "").trim() || "")
      ?.join()
      .trim(),
    div:
      /DIV: (\w+)/g.exec(info || "")?.[1] ||
      /DIV: (\w+)/g.exec(info || "")?.[0],
    class:
      /CLASSE: (\w+)/g.exec(info || "")?.[1] ||
      /CLASSE: (\w+)/g.exec(info || "")?.[0],
    score: rows,
  };
}

(async () => {
  console.log("run");
  console.log("crawl");
  console.log("matchId: ", matchId);
  console.log("lastShooterId: ", lastShooterId);
  console.time("crawl");
  const urls = Array(lastShooterId)
    .fill("")
    .map((_, index) => {
      return `https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${
        index + 1
      }&verify=Verify`;
    });
  console.log(urls);
  const browser = await puppeteer.launch({ headless: false });

  const results = await promiseAllInBatches(
    urls.map((url, index) => async () => {
      console.log("run list item");
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
  console.log(results);

  const failResult = results.filter((result) => {
    result.status === "rejected";
  });

  console.log("result fail count: ", failResult.length);
  console.timeEnd("crawl");

  const playerMarks = results
    .filter((result) => result.status === "fulfilled")
    .map((successResult) => {
      if (successResult.status === "fulfilled") {
        return successResult.value;
      }
    });

  const stageMax = stagesPoint.map((_, i) => {
    const a = playerMarks.map((player) => {
      const stage = player?.score.find(
        (stages) => stages.stage === (i + 1).toString()
      );
      return parseFloat(stage?.factor || "0");
    });
    return Math.max(...a);
  });

  console.log("state max: ", stageMax);
})();
