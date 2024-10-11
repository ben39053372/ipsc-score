"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withProxy = void 0;
const withProxy = (url, index = 1) => {
    const proxyUrl = `https://proxy-workers${(index % 10) + 1}.ilovehk-ben.workers.dev/proxy?modify&proxyUrl=${url}`;
    console.log({ proxyUrl });
    return proxyUrl;
};
exports.withProxy = withProxy;
