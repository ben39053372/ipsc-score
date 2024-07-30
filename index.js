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
exports.getAllMatches = exports.getScore = void 0;
const main_1 = require("./functions/main");
const getScore = (cloudEvent) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, main_1.main)();
});
exports.getScore = getScore;
var getAllMatches_1 = require("./functions/getAllMatches");
Object.defineProperty(exports, "getAllMatches", { enumerable: true, get: function () { return getAllMatches_1.getAllMatches; } });
