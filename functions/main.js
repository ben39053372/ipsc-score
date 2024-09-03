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
exports.main = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
const crawlData_1 = require("../utils/crawlData");
const promiseAllBatches_1 = require("../lib/promiseAllBatches");
const calData_1 = require("../utils/calData");
const uploadJson_1 = require("../utils/uploadJson");
const matchId = 127;
const lastShooterId = 232;
// paper 10, pp 5,
const stagesPoint = [160, 120, 50, 150, 50, 110];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("run");
        console.log("crawl");
        console.log("matchId: ", matchId);
        console.log("lastShooterId: ", lastShooterId);
        console.time("crawl");
        const urls = (0, crawlData_1.genUrls)(lastShooterId, matchId);
        const browser = yield puppeteer_1.default.launch({ timeout: 0 });
        const results = yield (0, promiseAllBatches_1.promiseAllInBatches)(urls.map((url, index) => () => __awaiter(this, void 0, void 0, function* () {
            const page = yield browser.newPage();
            yield page.setCacheEnabled(false);
            yield page.goto(url, { waitUntil: "domcontentloaded" });
            const html = yield page.content();
            const result = (0, crawlData_1.getData)(html, index);
            yield page.close();
            return result;
        })), 40);
        yield browser.close();
        const failResult = results.filter((result) => {
            result.status === "rejected";
        });
        console.log("result fail count: ", failResult.length);
        console.timeEnd("crawl");
        const playerMarks = results
            .filter((result) => result.status === "fulfilled")
            .map((successResult) => successResult.status === "fulfilled" ? successResult.value : undefined)
            .filter((i) => !!i);
        const filters = {
            // standard
            standardOverAll: (s) => s.div === "Standard",
            standardLady: (s) => s.div === "Standard" && s.cat === "Lady",
            standardJunior: (s) => s.div === "Standard" && s.cat === "Junior",
            standardSenior: (s) => s.div === "Standard" && s.cat === "Senior",
            standardSuperJunior: (s) => s.div === "Standard" && s.cat === "S. Junior",
            standardSuperSenior: (s) => s.div === "Standard" && s.cat === "S. Senior",
            // open
            openOverAll: (s) => s.div === "Open",
            openLady: (s) => s.div === "Open" && s.cat === "Lady",
            openJunior: (s) => s.div === "Open" && s.cat === "Junior",
            openSenior: (s) => s.div === "Open" && s.cat === "Senior",
            openSuperJunior: (s) => s.div === "Open" && s.cat === "S. Junior",
            openSuperSenior: (s) => s.div === "Open" && s.cat === "S. Senior",
            // production
            productionOverAll: (s) => s.div === "Production",
            productionLady: (s) => s.div === "Production" && s.cat === "Lady",
            productionJunior: (s) => s.div === "Production" && s.cat === "Junior",
            productionSenior: (s) => s.div === "Production" && s.cat === "Senior",
            productionSuperJunior: (s) => s.div === "Production" && s.cat === "S. Junior",
            productionSuperSenior: (s) => s.div === "Production" && s.cat === "S. Senior",
            // production optics
            productionOpticsOverAll: (s) => s.div === "Production Optics",
            productionOpticsLady: (s) => s.div === "Production Optics" && s.cat === "Lady",
            productionOpticsJunior: (s) => s.div === "Production Optics" && s.cat === "Junior",
            productionOpticsSenior: (s) => s.div === "Production Optics" && s.cat === "Senior",
            productionOpticsSuperJunior: (s) => s.div === "Production Optics" && s.cat === "S. Junior",
            productionOpticsSuperSenior: (s) => s.div === "Production Optics" && s.cat === "S. Senior",
            // classic
            classicOverAll: (s) => s.div === "Classic",
            classicLady: (s) => s.div === "Classic" && s.cat === "Lady",
            classicJunior: (s) => s.div === "Classic" && s.cat === "Junior",
            classicSenior: (s) => s.div === "Classic" && s.cat === "Senior",
            classicSuperJunior: (s) => s.div === "Classic" && s.cat === "S. Junior",
            classicSuperSenior: (s) => s.div === "Classic" && s.cat === "S. Senior",
        };
        const result = Object.entries(filters)
            .map(([key, filter]) => {
            return [key, (0, calData_1.calScore)(playerMarks.filter(filter), stagesPoint)];
        })
            .reduce((prev, curr) => {
            const result = prev;
            result[curr[0]] = curr[1];
            return result;
        }, {});
        yield (0, uploadJson_1.uploadJson)(`result-${matchId}.json`, JSON.stringify(result, null, 2)).catch(console.error);
    });
}
exports.main = main;
