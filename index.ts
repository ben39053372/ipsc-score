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
        // fetch(
        //   `https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${shooterId}&verify=Verify`,
        //   {
        //     headers: {
        //       accept:
        //         "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        //       "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        //       "sec-ch-ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
        //       "sec-ch-ua-mobile": "?0",
        //       "sec-ch-ua-platform": '"macOS"',
        //       "sec-fetch-dest": "document",
        //       "sec-fetch-mode": "navigate",
        //       "sec-fetch-site": "same-origin",
        //       "sec-fetch-user": "?1",
        //       "upgrade-insecure-requests": "1",
        //       Referer: `https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${shooterId}&verify=Verify`,
        //       "Referrer-Policy": "strict-origin-when-cross-origin",
        //     },
        //     body: null,
        //     mode: "same-origin",
        //     method: "GET",
        //   }
        // );
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

    // console.log(allResult);
  } catch (err) {
    console.error(err);
  }
}

main();
