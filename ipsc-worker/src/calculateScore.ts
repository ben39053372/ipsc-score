const getResult = async (DB: D1Database, matchId: number) => {
    const resultTableName = `match-result-${matchId}`;
    const resultRow = await DB.prepare(`
        SELECT * FROM "${resultTableName}"
    `).all<ResultRow>();
    return resultRow || null;
};

const getShooterList = async (DB: D1Database, matchId: number) => {
    const tableName = `match-${matchId}`;
    const shooterList = await DB.prepare(`
        SELECT DISTINCT name, div, class_name, cat FROM "${tableName}"
    `).all<MatchRow>();
    return shooterList || null;
}

const groupByGroup = {
    // standard
    standardOverAll: (s: MatchRow) => s.div === "Standard",
    standardLady: (s: MatchRow) => s.div === "Standard" && s.cat === "Lady",
    standardJunior: (s: MatchRow) =>
        s.div === "Standard" && s.cat === "Junior",
    standardSenior: (s: MatchRow) =>
        s.div === "Standard" && s.cat === "Senior",
    standardSuperJunior: (s: MatchRow) =>
        s.div === "Standard" && s.cat === "S. Junior",
    standardSuperSenior: (s: MatchRow) =>
        s.div === "Standard" && s.cat === "S. Senior",
    // open
    openOverAll: (s: MatchRow) => s.div === "Open",
    openLady: (s: MatchRow) => s.div === "Open" && s.cat === "Lady",
    openJunior: (s: MatchRow) => s.div === "Open" && s.cat === "Junior",
    openSenior: (s: MatchRow) => s.div === "Open" && s.cat === "Senior",
    openSuperJunior: (s: MatchRow) =>
        s.div === "Open" && s.cat === "S. Junior",
    openSuperSenior: (s: MatchRow) =>
        s.div === "Open" && s.cat === "S. Senior",
    // production
    productionOverAll: (s: MatchRow) => s.div === "Production",
    productionLady: (s: MatchRow) =>
        s.div === "Production" && s.cat === "Lady",
    productionJunior: (s: MatchRow) =>
        s.div === "Production" && s.cat === "Junior",
    productionSenior: (s: MatchRow) =>
        s.div === "Production" && s.cat === "Senior",
    productionSuperJunior: (s: MatchRow) =>
        s.div === "Production" && s.cat === "S. Junior",
    productionSuperSenior: (s: MatchRow) =>
        s.div === "Production" && s.cat === "S. Senior",
    // production optics
    productionOpticsOverAll: (s: MatchRow) => s.div === "Production Optics",
    productionOpticsLady: (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Lady",
    productionOpticsJunior: (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Junior",
    productionOpticsSenior: (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "Senior",
    productionOpticsSuperJunior: (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "S. Junior",
    productionOpticsSuperSenior: (s: MatchRow) =>
        s.div === "Production Optics" && s.cat === "S. Senior",
    // classic
    classicOverAll: (s: MatchRow) => s.div === "Classic",
    classicLady: (s: MatchRow) => s.div === "Classic" && s.cat === "Lady",
    classicJunior: (s: MatchRow) => s.div === "Classic" && s.cat === "Junior",
    classicSenior: (s: MatchRow) => s.div === "Classic" && s.cat === "Senior",
    classicSuperJunior: (s: MatchRow) =>
        s.div === "Classic" && s.cat === "S. Junior",
    classicSuperSenior: (s: MatchRow) =>
        s.div === "Classic" && s.cat === "S. Senior",
}

export const calScore = async (DB: D1Database, matchId: number) => {
    let stageCount = 0;
    const matchResult = await getResult(DB, matchId);
    if (!matchResult.success) return null;

    stageCount = Math.max(...matchResult.results.map(r => r.stage));
    const shooterList = await getShooterList(DB, matchId);

    const shooterByGroup = Object.entries(groupByGroup).map(([groupName, filterFn]) => {
        const groupPlayers = shooterList.results.filter((row) => filterFn(row));
        return { groupName, groupPlayers };
    });

    const stageMaxMeta = Object.entries(Object.groupBy(matchResult.results, (r) => r.stage)).map(([stage, stageResults]) => {
        if (!stageResults || stageResults.length === 0) return { stage, maxFactor: 0, maxPoint: 0 };
        return { stage, maxFactor: Math.max(...stageResults.map(r => parseFloat(r.factor))), maxPoint: (parseInt(stageResults[0].a) + parseInt(stageResults[0].c) + parseInt(stageResults[0].d) + parseInt(stageResults[0].mi) + parseInt(stageResults[0].ns) + parseInt(stageResults[0].pe)) * 5 };
    });



    console.log(stageMaxMeta);

    const shooterByGroupWithScore = shooterByGroup.map(({ groupName, groupPlayers }) => {
        groupPlayers.map((player) => {
            const stageResult = matchResult.results.filter((r) => r.name === player.name).map(r => ({ ...r, stagePoint: parseFloat(r.factor) / stageMaxMeta.find(m => parseInt(m.stage) === r.stage)!.maxFactor || 1 }));
            const stagePoint = 
        })
    })

    shooterByGroup.map(({ groupName, groupPlayers }) => {
        const stageResults = Array.from({ length: stageCount }, (_, i) => i + 1).map(stage => {
            const stagePlayers = groupPlayers.filter(stageRow => stageRow.stage === stage).sort((a, b) => parseFloat(a.factor) - parseFloat(b.factor));
            const stageMaxFactor = stageMaxFactor.find(f => f.stage === stage)?.maxFactor || 0;
            const stageMaxPoint = (parseInt(stagePlayers[0]?.a) + parseInt(stagePlayers[0]?.c) + parseInt(stagePlayers[0]?.d) + parseInt(stagePlayers[0]?.mi) + parseInt(stagePlayers[0]?.ns) + parseInt(stagePlayers[0]?.pe)) * 5;
            const stagePlayerResult = stagePlayers.map(player => {
                const stagePoint = parseFloat(player.factor) / stageMaxFactor * stageMaxPoint;
                return {
                    ...player,
                    stagePoint,
                }
            }).sort((a, b) => b.stagePoint - a.stagePoint);

            return { stage, stagePlayerResult };
        });
        console.log("stageResult Lenght:", stageResults.length, "stageCount:", stageCount);
        console.log(groupName, "groupPlayers Length:", groupPlayers.length);
        const groupResult = shooterList.results.map((shooter) => {
            const totalStagePoint = stageResults.map(stateResult => stateResult.stagePlayerResult.find(_stagePlayerResult => _stagePlayerResult.name === shooter.name)?.stagePoint || 0).reduce((acc, curr) => acc + curr, 0);
            return {
                ...shooter,
                totalStagePoint,
            }
        })
    })



}