"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calScore = exports.calStageScore = exports.calMaxHf = void 0;
function calMaxHf(playerMarks, stageCount) {
    return Array(stageCount)
        .fill(null)
        .map((_, i) => Math.max(...playerMarks.map((player) => {
        const stage = player === null || player === void 0 ? void 0 : player.score.find((stages) => stages.stage === (i + 1).toString());
        return parseFloat((stage === null || stage === void 0 ? void 0 : stage.factor) || "0");
    })));
}
exports.calMaxHf = calMaxHf;
function calStageScore(playerMarks, maxHf, stagesPoint) {
    return playerMarks.map((pm) => {
        const score = pm.score.map((score) => {
            const stage = parseInt(score.stage || "");
            const stageMax = maxHf.at(stage - 1);
            const stagePoint = stagesPoint.at(stage - 1);
            const scorePercentage = stageMax
                ? parseFloat(score.factor) / stageMax
                : 0;
            console.log({ stagePoint, scorePercentage });
            const totalScore = stagePoint ? stagePoint * scorePercentage : 0;
            return Object.assign(Object.assign({}, score), { totalScore,
                scorePercentage });
        });
        return Object.assign(Object.assign({}, pm), { score, totalScore: score
                .map((s) => s.totalScore)
                .reduce((partialSum, a) => partialSum + a, 0) });
    });
}
exports.calStageScore = calStageScore;
function calScore(playerMarks, stagePoint) {
    const maxHf = calMaxHf(playerMarks, stagePoint.length);
    const result = calStageScore(playerMarks, maxHf, stagePoint).sort((a, b) => b.totalScore - a.totalScore);
    // console.log(result);
    return result;
}
exports.calScore = calScore;
