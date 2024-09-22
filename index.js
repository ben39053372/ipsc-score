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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScore = void 0;
const functions_framework_1 = require("@google-cloud/functions-framework");
const main_1 = require("./functions/main");
const getAllMatches_1 = require("./functions/getAllMatches");
const getScore = (cloudEvent) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(cloudEvent);
    console.log(cloudEvent.attributes);
    const attr = cloudEvent.attributes;
    if (!attr.lastShooterId && !attr.matchId && !attr.stagesPoint) {
        console.error("missing attributes");
        return;
    }
    yield (0, main_1.main)(attr.matchId, attr.lastShooterId, JSON.parse(attr.stagesPoint));
});
exports.getScore = getScore;
(0, functions_framework_1.http)("getAllMatches", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, getAllMatches_1.getAllMatches)();
    res.json(result);
}));
