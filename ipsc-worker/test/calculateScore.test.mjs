import assert from "node:assert/strict";
import test from "node:test";
import { calScore } from "../src/calculateScore.ts";

test("stage maximum counts scoring hits and misses, but not penalties", async () => {
    const shooters = [
        { name: "Chin, Chun Hei", div: "Production", class_name: "G", cat: null, shooter_id: 162 },
        { name: "Poon, Yui Yin Galen", div: "Production", class_name: "G", cat: null, shooter_id: 1 },
        { name: "Missed targets", div: "Production", class_name: "G", cat: null, shooter_id: 2 },
    ];
    const results = [
        { name: shooters[0].name, stage: 2, factor: "7.7685", pts: "149", a: "28", c: "3", d: "0", mi: "0", ns: "0", pe: "0", time: "19.18" },
        { name: shooters[1].name, stage: 2, factor: "6.1795", pts: "137", a: "27", c: "4", d: "0", mi: "0", ns: "1", pe: "2", time: "22.17" },
        { name: shooters[2].name, stage: 2, factor: "2.0000", pts: "100", a: "20", c: "5", d: "1", mi: "5", ns: "0", pe: "0", time: "50" },
    ];
    const db = {
        prepare(query) {
            return {
                async all() {
                    return { success: true, results: query.includes("LEFT JOIN") ? shooters : results };
                },
            };
        },
    };

    const [group] = await calScore(db, 45, "match", "Production OverAll");
    const chin = group.groupResults.find((player) => player.name === shooters[0].name);
    const poon = group.groupResults.find((player) => player.name === shooters[1].name);
    assert.equal(chin.stageResult[0].stagePoint, 155);
    assert.equal(chin.totalStagePoint, 155);
    assert.equal(chin.rank, 1);
    assert.ok(Math.abs(poon.stageResult[0].stagePoint - (137 / 22.17) / (149 / 19.18) * 155) < 1e-10);
});

test("misses contribute to the maximum stage points", async () => {
    const shooter = { name: "Shooter", div: "Production", class_name: "G", cat: null, shooter_id: 1 };
    const result = { name: shooter.name, stage: 1, factor: "5.0000", pts: "50", a: "10", c: "0", d: "0", mi: "2", ns: "0", pe: "0", time: "10" };
    const db = {
        prepare(query) {
            return {
                async all() {
                    return { success: true, results: query.includes("LEFT JOIN") ? [shooter] : [result] };
                },
            };
        },
    };

    const [group] = await calScore(db, 45, "match", "Production OverAll");
    assert.equal(group.groupResults[0].stageResult[0].stagePoint, 60);
});
