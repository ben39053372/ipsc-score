import jsdom from "jsdom";

export function genUrls(lastShooterId: number, matchId: number) {
  return Array(lastShooterId)
    .fill(null)
    .map((_, index) => {
      return `https://hkg.ipscess.org/portal/verify/${matchId}?shooter=${
        index + 1
      }&verify=Verify`;
    });
}

export function getData(html: string, index: number) {
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
    div: /DIV:\s+(.*)CLASSE/g.exec(info || "")?.[1].trim(),
    class: /CLASSE:\s+(.*)FATOR/g.exec(info || "")?.[1].trim(),
    cat: /CAT:\s+(.*)/g.exec(info || "")?.[1].trim(),
    score: rows,
  };
}
