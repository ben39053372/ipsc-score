import jsdom from "jsdom";

main();

async function main() {
  const getShooterScoreByShooterId = (matchId: number, shooterId: number) => {
    return () =>
      fetch(
        `https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${shooterId}&verify=Verify`
      );
  };

  const matchId = 105;

  const lastShooterId = 258;

  const fetchShooterCallBacks = [];

  const allResult = [];

  for (let shooterId = 1; shooterId < lastShooterId; shooterId++) {
    fetchShooterCallBacks.push(getShooterScoreByShooterId(matchId, shooterId));
  }

  for await (let [index, callback] of fetchShooterCallBacks.entries()) {
    let shooterResultResponse = await callback();
    const html = await shooterResultResponse.text();
    const dom = new jsdom.JSDOM(html);

    const listOfTr: NodeListOf<HTMLTableRowElement> =
      dom.window.document.querySelectorAll("body > div > form > table tr");

    const rows = Array.from(listOfTr);

    const result = rows.slice(1).map((row, index) => {
      const td = row.querySelectorAll("td");
      const data = Array.from(td).map((td) => td.innerHTML)?.[1];
      return data || "";
    });

    if (result.length > 1) {
      allResult.push([index + 1, ...result].join());
    }
  }

  console.log("allResult: ", allResult.join("\n"));
}
