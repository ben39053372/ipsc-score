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
const axios_1 = __importDefault(require("axios"));
const jsdom_1 = __importDefault(require("jsdom"));
function promiseAllInBatches(list, batchSize) {
    return __awaiter(this, void 0, void 0, function* () {
        let position = 0;
        let results = [];
        while (position < list.length) {
            console.log("position:", position);
            const itemsForBatch = list.slice(position, position + batchSize);
            results = [...results, ...(yield Promise.allSettled(itemsForBatch))];
            position += batchSize;
            yield new Promise((r) => setTimeout(r, 1500));
        }
        return results;
    });
}
function getData(fetchResults) {
    return __awaiter(this, void 0, void 0, function* () {
        const allResult = yield Promise.allSettled(fetchResults.map((result, index) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            if (result.status === "fulfilled") {
                const value = yield result.value();
                console.log(value);
                const html = yield value.text();
                const dom = new jsdom_1.default.JSDOM(html);
                if (html.length <= 150) {
                    console.error("502 bad gateway");
                }
                const name = (_a = dom.window.document.querySelector("body > div > form > div.row.mt-6.p-2 > div.col-4")) === null || _a === void 0 ? void 0 : _a.innerHTML;
                const info = (_b = dom.window.document.querySelector("body > div > form > div.row.mt-6.p-2 > .text-right")) === null || _b === void 0 ? void 0 : _b.innerHTML;
                if (!info) {
                    console.log(html);
                }
                const tableRowNodeList = dom.window.document.querySelectorAll("body > div > form > table tr");
                const rows = Array.from(tableRowNodeList)
                    .map((row) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                    const td = row.querySelectorAll("td");
                    return {
                        stage: (_b = /\d+/.exec((_a = td[0]) === null || _a === void 0 ? void 0 : _a.innerHTML)) === null || _b === void 0 ? void 0 : _b[0],
                        factor: (_c = td[1]) === null || _c === void 0 ? void 0 : _c.innerHTML,
                        pts: (_d = td[2]) === null || _d === void 0 ? void 0 : _d.innerHTML,
                        a: (_e = td[3]) === null || _e === void 0 ? void 0 : _e.innerHTML,
                        c: (_f = td[4]) === null || _f === void 0 ? void 0 : _f.innerHTML,
                        d: (_g = td[5]) === null || _g === void 0 ? void 0 : _g.innerHTML,
                        mi: (_h = td[6]) === null || _h === void 0 ? void 0 : _h.innerHTML,
                        ns: (_j = td[7]) === null || _j === void 0 ? void 0 : _j.innerHTML,
                        pe: (_k = td[8]) === null || _k === void 0 ? void 0 : _k.innerHTML,
                        time: (_l = td[10]) === null || _l === void 0 ? void 0 : _l.innerHTML,
                    };
                })
                    .slice(1);
                // console.log(`${index}: ${JSON.stringify({ info })}`);
                return {
                    id: index + 1,
                    name: (_c = /[a-zA-Z,\s]+/g
                        .exec((name === null || name === void 0 ? void 0 : name.replace("\n", "").trim()) || "")) === null || _c === void 0 ? void 0 : _c.join().trim(),
                    div: ((_d = /DIV: (\w+)/g.exec(info || "")) === null || _d === void 0 ? void 0 : _d[1]) ||
                        ((_e = /DIV: (\w+)/g.exec(info || "")) === null || _e === void 0 ? void 0 : _e[0]),
                    class: ((_f = /CLASSE: (\w+)/g.exec(info || "")) === null || _f === void 0 ? void 0 : _f[1]) ||
                        ((_g = /CLASSE: (\w+)/g.exec(info || "")) === null || _g === void 0 ? void 0 : _g[0]),
                    score: rows,
                };
            }
        })));
        return allResult;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const getShooterScoreByShooterId = (matchId, shooterId) => {
                return () => axios_1.default
                    .get(`https://portal-hkg.iroascoring.com/portal/verify/${matchId}?shooter=${shooterId}&verify=Verify`)
                    .then((res) => res.data);
            };
            const matchId = 105;
            const lastShooterId = 258;
            const fetchShooterCallBacks = [];
            for (let shooterId = 1; shooterId < lastShooterId; shooterId++) {
                fetchShooterCallBacks.push(getShooterScoreByShooterId(matchId, shooterId));
            }
            // const fetchResults = await promiseAllInBatches(fetchShooterCallBacks, 1);
            const fetchResults = yield Promise.allSettled(fetchShooterCallBacks);
            const allResult = yield getData(fetchResults);
            console.log(allResult);
        }
        catch (err) {
            console.error(err);
        }
    });
}
main();
