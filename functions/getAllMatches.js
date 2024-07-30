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
exports.getAllMatches = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
function getAllMatches() {
    return __awaiter(this, void 0, void 0, function* () {
        const browser = yield puppeteer_1.default.launch({
            args: ["--ignore-certificate-errors"],
        });
        const page = yield browser.newPage();
        yield page.goto("https://portal-hkg.iroascoring.com/portal", {});
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
        console.log({ data });
    });
}
exports.getAllMatches = getAllMatches;
getAllMatches();
