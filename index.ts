import axios from "axios";
import jsdom from "jsdom";

async function promiseAllInBatches<T>(
  list: (() => Promise<T>)[],
  batchSize: number
): Promise<PromiseSettledResult<() => Promise<T>>[]> {
  let position = 0;
  let results: PromiseSettledResult<() => Promise<T>>[] = [];
  while (position < list.length) {
    console.log("position:", position);
    const itemsForBatch = list.slice(position, position + batchSize);
    results = [...results, ...(await Promise.allSettled(itemsForBatch))];
    position += batchSize;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return results;
}

async function getData(
  fetchResults: PromiseSettledResult<() => Promise<Response>>[]
) {
  const allResult = await Promise.allSettled(
    fetchResults.map(async (result, index) => {
      if (result.status === "fulfilled") {
        const value = await result.value();
        console.log(value);
        const html = await value.text();
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
    })
  );
  return allResult;
}

async function main() {
  try {
    const getShooterScoreByShooterId = (matchId: number, shooterId: number) => {
      return () =>
        axios
          .get(
            `https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${shooterId}&verify=Verify`
          )
          .then((res) => res.data);
    };

    const matchId = 105;

    const lastShooterId = 258;

    const fetchShooterCallBacks = [];

    for (let shooterId = 1; shooterId < lastShooterId; shooterId++) {
      fetchShooterCallBacks.push(
        getShooterScoreByShooterId(matchId, shooterId)
      );
    }

    // const fetchResults = await promiseAllInBatches(fetchShooterCallBacks, 1);
    const fetchResults = await Promise.allSettled(fetchShooterCallBacks);

    const allResult = await getData(fetchResults);

    console.log(allResult);
  } catch (err) {
    console.error(err);
  }
}

main();
