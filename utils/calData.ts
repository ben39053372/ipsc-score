export function calMaxHf(playerMarks: PlayerMark[], stageCount: number) {
  return Array(stageCount)
    .fill(null)
    .map((_, i) =>
      Math.max(
        ...playerMarks.map((player) => {
          const stage = player?.score.find(
            (stages) => stages.stage === (i + 1).toString()
          );
          return parseFloat(stage?.factor || "0");
        })
      )
    );
}

export function calStageScore(
  playerMarks: PlayerMark[],
  maxHf: number[],
  stagesPoint: number[]
): PlayerMarkWithScore[] {
  return playerMarks.map((pm) => {
    const score = pm.score.map((score) => {
      const stage = parseInt(score.stage || "");
      const stageMax = maxHf.at(stage - 1);
      const stagePoint = stagesPoint.at(stage - 1);
      const scorePercentage = stageMax
        ? parseFloat(score.factor) / stageMax
        : 0;
      const totalScore = stagePoint ? stagePoint * scorePercentage : 0;
      return {
        ...score,
        totalScore,
        scorePercentage,
      };
    });
    return {
      ...pm,
      score,
      totalScore: score
        .map((s) => s.totalScore)
        .reduce((partialSum, a) => partialSum + a, 0),
    };
  });
}

export function calScore(playerMarks: PlayerMark[], stagePoint: number[]) {
  const maxHf = calMaxHf(playerMarks, stagePoint.length);
  const result = calStageScore(playerMarks, maxHf, stagePoint);
  // console.log(result);
  return result;
}
