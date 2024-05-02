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
exports.uploadJson = void 0;
const storage_1 = require("@google-cloud/storage");
function uploadJson(name, contents) {
    return __awaiter(this, void 0, void 0, function* () {
        const bucketName = "ipsc-score";
        const destFileName = name;
        const storage = new storage_1.Storage();
        yield storage.bucket(bucketName).file(destFileName).save(contents);
        console.log(`${destFileName} with contents ${contents} uploaded to ${bucketName}.`);
    });
}
exports.uploadJson = uploadJson;
