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
exports.getProxyList = void 0;
const getProxyList = () => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield fetch("https://proxylist.geonode.com/api/proxy-list?country=HK&speed=fast&limit=50&page=1&sort_by=lastChecked&sort_type=desc");
    const json = yield res.json();
    const data = json.data;
    return data.map((proxy) => `${proxy.protocols[0]}://${proxy.ip}:${proxy.port}`);
});
exports.getProxyList = getProxyList;
