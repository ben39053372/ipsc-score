"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.genUrls = genUrls;
exports.getData = getData;
const jsdom_1 = __importDefault(require("jsdom"));
function genUrls(lastShooterId, matchId) {
    return Array(lastShooterId)
        .fill(null)
        .map((_, index) => {
        return `https://hkg.ipscess.org/portal/verify/${matchId}?shooter=${index + 1}&verify=Verify`;
    });
}
function getData(html, index) {
    var _a, _b, _c, _d, _e, _f;
    const dom = new jsdom_1.default.JSDOM(html);
    if (html.length <= 150) {
        console.error("502 bad gateway");
        throw new Error("502 bad gateway");
    }
    const name = (_a = dom.window.document.querySelector("body > div > form > div.row.mt-6.p-2 > div.col-4")) === null || _a === void 0 ? void 0 : _a.innerHTML;
    const info = (_b = dom.window.document.querySelector("body > div > form > div.row.mt-6.p-2 > .text-right")) === null || _b === void 0 ? void 0 : _b.innerHTML;
    if (!info) {
        // console.log(html);
        console.warn(html);
        throw new Error("info not found");
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
    return {
        id: index + 1,
        name: (_c = /[a-zA-Z,\s]+/g
            .exec((name === null || name === void 0 ? void 0 : name.replace("\n", "").trim()) || "")) === null || _c === void 0 ? void 0 : _c.join().trim(),
        div: (_d = /DIV:\s+(.*)CLASSE/g.exec(info || "")) === null || _d === void 0 ? void 0 : _d[1].trim(),
        class: (_e = /CLASSE:\s+(.*)FATOR/g.exec(info || "")) === null || _e === void 0 ? void 0 : _e[1].trim(),
        cat: (_f = /CAT:\s+(.*)/g.exec(info || "")) === null || _f === void 0 ? void 0 : _f[1].trim(),
        score: rows,
    };
}
