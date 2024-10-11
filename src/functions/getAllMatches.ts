import puppeteer from "puppeteer";
import { v1 } from "@google-cloud/scheduler";
import { withProxy } from "../utils/withProxy";

let cache = {
  value: null,
  ttl: null,
};

const jobName =
  "projects/ipsc-score-422008/locations/asia-east2/jobs/crawl-ipsc-score-job";
const topicName = "projects/ipsc-score-422008/topics/getScore";

export async function getAllMatches() {
  const schedulerClient = new v1.CloudSchedulerClient();
  const currentTime = new Date();
  if (cache.value && cache.ttl > currentTime) {
    return cache.value;
  }

  const browser = await puppeteer.launch({
    args: ["--ignore-certificate-errors"],
  });
  const page = await browser.newPage();

  await page.goto(
    withProxy(
      "https://hkg.ipscess.org/portal",
      Math.floor(Math.random() * 10 + 1)
    ),
    {}
  );

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
  await browser.close();
  cache.value = data;
  cache.ttl = new Date(currentTime.getTime() + 60 * 60 * 1000);

  const job = await schedulerClient.getJob({ name: jobName });
  console.log(job);

  await schedulerClient.updateJob({
    job: {
      name: jobName,
      schedule: "*/10 * * * *",
      timeZone: "Asia/Hong_Kong",
      pubsubTarget: {
        topicName: "projects/ipsc-score-422008/topics/getScore",
        attributes: {
          ...job[0].pubsubTarget.attributes,
          matchId: data[0].matchId,
          matchName: data[0].matchName,
        },
      },
    },
  });

  const today = new Date();
  const matchDate = new Date(data[0].date.split("/").reverse().join("-"));

  if (Math.abs(today.getTime() - matchDate.getTime()) < 86400000 * 2) {
    // matchDate
    const response = await schedulerClient.resumeJob({
      name: jobName,
    });
    console.log("resume job:", { response });
  } else {
    // non matchDate
    const response = await schedulerClient.pauseJob({
      name: jobName,
    });
    console.log("resume job:", { response });
  }

  return data;
}
