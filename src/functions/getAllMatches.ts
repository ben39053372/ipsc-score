import puppeteer from "puppeteer";

export async function getAllMatches() {
  const browser = await puppeteer.launch({
    args: ["--ignore-certificate-errors"],
  });
  const page = await browser.newPage();

  await page.goto("https://portal-hkg.iroascoring.com/portal", {});

  const data = await page.$$eval("body > div > main > div > a", (opts) => {
    const result = opts
      .map((opt) => opt.outerHTML)
      .map((html) => {
        const matchId = /match=(\d+)/.exec(html);
        const matchName = /<h5 class="mb-1">(.*)<\/h5>/.exec(html);
        const date = /<small>(.*)<\/small>/.exec(html);
        return {
          matchId: matchId.at(-1),
          matchName: matchName.at(-1),
          date: date.at(-1),
        };
      });
    return result;
  });
  console.log({ data });
  await browser.close();
  return data;
}
