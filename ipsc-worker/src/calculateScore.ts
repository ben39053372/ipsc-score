const getResult = async (DB: D1Database, matchId: number, href: string) => {
    const resultTableName = `match-result-${href}-${matchId}`;
    const resultRow = await DB.prepare(`
        SELECT * FROM "${resultTableName}"
    `).all<ResultRow>();
    return resultRow || null;
};

const getShooterList = async (DB: D1Database, matchId: number, href: string) => {
    const tableName = `match-${href}-${matchId}`;
    const resultTableName = `match-result-${href}-${matchId}`;
    const shooterList = await DB.prepare(`
        SELECT
            m.name,
            m.div,
            m.class_name,
            m.cat,
            MAX(r.shooter_id) AS shooter_id
        FROM "${tableName}" m
        LEFT JOIN "${resultTableName}" r ON r.name = m.name
        GROUP BY m.name, m.div, m.class_name, m.cat
    `).all<MatchRow>();
    return shooterList || null;
}

const groupByGroup = {
    // standard
    "Standard OverAll": (s: MatchRow) => s.div === "Standard",
    "Standard Lady": (s: MatchRow) => s.div === "Standard" && s.cat === "Lady",
    "Standard Junior": (s: MatchRow) =>
        s.div === "Standard" && s.cat === "Junior",
    "Standard Senior": (s: MatchRow) =>
        s.div === "Standard" && s.cat === "Senior",
    "Standard Super Junior": (s: MatchRow) =>
        s.div === "Standard" && s.cat === "S. Junior",
    "Standard Super Senior": (s: MatchRow) =>
        s.div === "Standard" && s.cat === "S. Senior",
    // open
    "Open OverAll": (s: MatchRow) => s.div === "Open",
    "Open Lady": (s: MatchRow) => s.div === "Open" && s.cat === "Lady",
    "Open Junior": (s: MatchRow) => s.div === "Open" && s.cat === "Junior",
    "Open Senior": (s: MatchRow) => s.div === "Open" && s.cat === "Senior",
    "Open Super Junior": (s: MatchRow) =>
        s.div === "Open" && s.cat === "S. Junior",
    "Open Super Senior": (s: MatchRow) =>
        s.div === "Open" && s.cat === "S. Senior",
    // production
    "Production OverAll": (s: MatchRow) => s.div === "Production",
    "Production Lady": (s: MatchRow) =>
        s.div === "Production" && s.cat === "Lady",
    "Production Junior": (s: MatchRow) =>
        s.div === "Production" && s.cat === "Junior",
    "Production Senior": (s: MatchRow) =>
        s.div === "Production" && s.cat === "Senior",
    "Production Super Junior": (s: MatchRow) =>
        s.div === "Production" && s.cat === "S. Junior",
    "Production Super Senior": (s: MatchRow) =>
        s.div === "Production" && s.cat === "S. Senior",
    // production optics
    "Production Optics OverAll": (s: MatchRow) => s.div === "Production Optics",
    "Production Optics Lady": (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Lady",
    "Production Optics Junior": (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Junior",
    "Production Optics Senior": (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Senior",
    "Production Optics Super Junior": (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "S. Junior",
    "Production Optics Super Senior": (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "S. Senior",
    // classic
    "Classic OverAll": (s: MatchRow) => s.div === "Classic",
    "Classic Lady": (s: MatchRow) => s.div === "Classic" && s.cat === "Lady",
    "Classic Junior": (s: MatchRow) => s.div === "Classic" && s.cat === "Junior",
    "Classic Senior": (s: MatchRow) => s.div === "Classic" && s.cat === "Senior",
    "Classic Super Junior": (s: MatchRow) =>
        s.div === "Classic" && s.cat === "S. Junior",
    "Classic Super Senior": (s: MatchRow) =>
        s.div === "Classic" && s.cat === "S. Senior",
}

type GroupName = keyof typeof groupByGroup;

export const calScore = async (DB: D1Database, matchId: number, href: string, group?: GroupName) => {
    const matchResult = await getResult(DB, matchId, href);
    if (!matchResult.success) return null;

    const shooterList = await getShooterList(DB, matchId, href);

    const shooterByGroup = Object.entries(groupByGroup).filter(([groupName, _]) => !group || groupName === group).map(([groupName, filterFn]) => {
        const groupPlayers = shooterList.results.filter((row) => filterFn(row));
        return { groupName, groupPlayers };
    });


    const shooterByGroupWithScore = shooterByGroup.map(({ groupName, groupPlayers }) => {
        const groupResult = matchResult.results.filter(r => groupPlayers.some(p => p.name === r.name))
        const groupStageMaxMeta = Object.entries(Object.groupBy(groupResult, (r) => r.stage)).map(([stage, stageResults]) => {
            if (!stageResults || stageResults.length === 0) return { stage, maxFactor: 0, maxPoint: 0 };
            const factor = [...stageResults.map(r => parseInt(r.pts) / parseFloat(r.time))]
            return { stage, maxFactor: Math.max(...factor.filter(v => Number.isFinite(v))), maxPoint: (parseInt(stageResults[0].a) + parseInt(stageResults[0].c) + parseInt(stageResults[0].d) + parseInt(stageResults[0].mi) + parseInt(stageResults[0].ns) + parseInt(stageResults[0].pe)) * 5 };
        })
        return {
            groupName, groupResults: groupPlayers.map((player) => {
                const stageResult = matchResult.results.filter((r) => r.name === player.name).map(r => {
                    const stageMax = groupStageMaxMeta.find(f => parseInt(f.stage) === r.stage)
                    const factor = parseInt(r.pts) / parseFloat(r.time);
                    return { ...r, stagePoint: ((factor ? factor : 0) / (stageMax ? stageMax.maxFactor : 0) * (stageMax ? stageMax.maxPoint : 0)) };
                });
                const totalStagePoint = stageResult.map(r => r.stagePoint).reduce((acc, curr) => acc + curr, 0);
                const dq = stageResult.every(r => r.factor === "0.0000" && r.pts !== "0")
                return { ...player, totalStagePoint, stageResult, dq };
            }).sort((a, b) => {
                if (a.dq !== b.dq) return a.dq ? 1 : -1;
                return b.totalStagePoint - a.totalStagePoint;
            }).map((player, index, sortedArray) => {
                return {
                    ...player,
                    rank: index + 1,
                    percent: player.totalStagePoint / (sortedArray[0] ? sortedArray[0].totalStagePoint : 1) * 100
                }
            })
        }
    })

    return shooterByGroupWithScore;



}