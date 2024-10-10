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
exports.promiseAllInBatches = promiseAllInBatches;
function promiseAllInBatches(list, batchSize) {
    return __awaiter(this, void 0, void 0, function* () {
        let position = 0;
        let results = [];
        while (position < list.length) {
            console.log(`batching: ${position}/${list.length} ... `);
            const itemsForBatch = list.slice(position, position + batchSize);
            results = [
                ...results,
                ...(yield Promise.allSettled(itemsForBatch.map((item) => item()))),
            ];
            position += batchSize;
            yield new Promise((r) => setTimeout(r, 1));
        }
        return results;
    });
}
