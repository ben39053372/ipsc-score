"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMatches = getAllMatches;
const puppeteer_1 = __importDefault(require("puppeteer"));
const scheduler_1 = require("@google-cloud/scheduler");
const withProxy_1 = require("../utils/withProxy");
const uploadJson_1 = require("../utils/uploadJson");
const jobName = "projects/ipsc-score-422008/locations/asia-east2/jobs/crawl-ipsc-score-job";
const topicName = "projects/ipsc-score-422008/topics/getScore";
function getAllMatches() {
    return __awaiter(this, void 0, void 0, function* () {
        const schedulerClient = new scheduler_1.v1.CloudSchedulerClient();
        const browser = yield puppeteer_1.default.launch({
            args: ["--ignore-certificate-errors"],
        });
        const page = yield browser.newPage();
        yield page.goto((0, withProxy_1.withProxy)("https://hkg.ipscess.org/portal", Math.floor(Math.random() * 10 + 1)), {});
        const data = yield page.$$eval("body > div > main > div > a", (opts) => {
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
        yield (0, uploadJson_1.uploadMatchJson)(JSON.stringify(data));
        yield browser.close();
        const job = yield schedulerClient.getJob({ name: jobName });
        console.log(job);
        yield schedulerClient.updateJob({
            job: {
                name: jobName,
                schedule: "*/10 * * * *",
                timeZone: "Asia/Hong_Kong",
                pubsubTarget: {
                    topicName: "projects/ipsc-score-422008/topics/getScore",
                    attributes: Object.assign(Object.assign({}, job[0].pubsubTarget.attributes), { matchId: data[0].matchId, matchName: data[0].matchName }),
                },
            },
        });
        const today = new Date();
        const matchDate = new Date(data[0].date.split("/").reverse().join("-"));
        if (Math.abs(today.getTime() - matchDate.getTime()) < 86400000 * 2) {
            // matchDate
            const response = yield schedulerClient.resumeJob({
                name: jobName,
            });
            console.log("resume job:", { response });
        }
        else {
            // non matchDate
            const response = yield schedulerClient.pauseJob({
                name: jobName,
            });
            console.log("resume job:", { response });
        }
        return data;
    });
}
