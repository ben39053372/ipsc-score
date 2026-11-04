import assert from "node:assert/strict";
import test from "node:test";
import { calculatePredictions } from "../src/predictScore.ts";
import { calScore } from "../src/calculateScore.ts";

const shooter = (name, div = "Standard") => ({ name, div });
const result = (name, stage, hf, { factor = hf.toFixed(4), pts = 100, time = 100 / hf } = {}) => ({
    name,
    stage,
    factor,
    pts: String(pts),
    a: String(Math.max(0, pts / 5)),
    c: "0",
    d: "0",
    mi: "0",
    time: String(time),
});

const completeReferenceResults = () => [
    result("Ref A", 1, 10),
    result("Ref A", 2, 20),
    result("Ref A", 3, 30),
    result("Ref B", 1, 20),
    result("Ref B", 2, 30),
    result("Ref B", 3, 50),
];

test("uses division-specific medians and the configured shrinkage prior", () => {
    const shooters = [
        shooter("Ref A"),
        shooter("Ref B"),
        shooter("Target"),
        shooter("Other division ref", "Open"),
        shooter("Other division target", "Open"),
    ];
    const results = [
        ...completeReferenceResults(),
        result("Target", 1, 15),
        result("Target", 3, 20),
        result("Other division ref", 1, 100),
        result("Other division ref", 2, 100),
        result("Other division ref", 3, 100),
        result("Other division target", 1, 150),
        result("Other division target", 3, 200),
    ];

    const predictions = calculatePredictions(shooters, results);
    const target = predictions.get("Target");
    const otherDivisionTarget = predictions.get("Other division target");

    assert.equal(target.status, "predicted");
    assert.equal(target.referenceShooterCount, 2);
    assert.equal(target.completedStageCount, 2);
    assert.equal(target.n, 2);
    assert.equal(target.k, 2);
    assert.equal(target.priorRelativeHF, 1);
    assert.equal(target.averageRelativeHF, 0.75);
    assert.equal(target.lambda, 0.5);
    assert.equal(target.predictedRelativeHF, 0.875);
    assert.equal(target.stages.find((stage) => stage.stage === 2).baselineHF, 25);
    assert.equal(target.stages.find((stage) => stage.stage === 2).predictedHF, 21.875);

    const customized = calculatePredictions(shooters, results, { k: 1, priorRelativeHF: 0 }).get("Target");
    assert.equal(customized.lambda, 2 / 3);
    assert.equal(customized.predictedRelativeHF, 0.5);
    assert.equal(customized.stages.find((stage) => stage.stage === 2).predictedHF, 12.5);

    assert.equal(otherDivisionTarget.status, "predicted");
    assert.equal(otherDivisionTarget.referenceShooterCount, 1);
    assert.equal(otherDivisionTarget.stages.find((stage) => stage.stage === 2).baselineHF, 100);
    assert.equal(otherDivisionTarget.stages.find((stage) => stage.stage === 2).predictedHF, 137.5);
});

test("excludes incomplete and disqualified shooters from one fixed reference cohort", () => {
    const shooters = [
        shooter("Ref A"),
        shooter("Ref B"),
        shooter("Partial reference"),
        shooter("Zero-HF reference"),
        shooter("DQ reference"),
        shooter("Target"),
    ];
    const results = [
        ...completeReferenceResults(),
        result("Partial reference", 1, 100),
        result("Partial reference", 2, 100),
        result("Zero-HF reference", 1, 100),
        result("Zero-HF reference", 2, 100),
        result("Zero-HF reference", 3, 0, { pts: 0, time: 10 }),
        result("DQ reference", 1, 0, { factor: "0.0000", pts: 10, time: 1 }),
        result("DQ reference", 2, 0, { factor: "0.0000", pts: 10, time: 1 }),
        result("DQ reference", 3, 0, { factor: "0.0000", pts: 10, time: 1 }),
        result("Target", 1, 10),
        result("Target", 3, 30),
    ];

    const predictions = calculatePredictions(shooters, results);

    assert.equal(predictions.get("Target").referenceShooterCount, 2);
    assert.equal(predictions.get("DQ reference").reason, "shooter_disqualified");
    assert.equal(predictions.get("Partial reference").referenceShooterCount, 2);
    assert.equal(predictions.get("Zero-HF reference").referenceShooterCount, 2);
});

test("counts zero-HF records as completed but excludes them from relative HF averaging", () => {
    const shooters = [
        shooter("Ref A"),
        shooter("Ref B"),
        shooter("Zero shooter"),
        shooter("DQ shooter"),
        shooter("Complete shooter"),
    ];
    const results = [
        ...completeReferenceResults(),
        result("Zero shooter", 1, 0, { pts: 0, time: 10 }),
        result("Zero shooter", 3, 20),
        ...[1, 2].map((stage) =>
            result("DQ shooter", stage, 0, { factor: "0.0000", pts: 5, time: 1 }),
        ),
        ...[1, 2, 3].map((stage) => result("Complete shooter", stage, 15)),
    ];

    const predictions = calculatePredictions(shooters, results);

    assert.equal(predictions.get("Zero shooter").completedStageCount, 2);
    assert.equal(predictions.get("Zero shooter").status, "predicted");
    assert.equal(predictions.get("Zero shooter").n, 1);
    assert.equal(predictions.get("Zero shooter").averageRelativeHF, 2 / 3);
    assert.equal(predictions.get("Zero shooter").lambda, 1 / 3);
    assert.equal(predictions.get("DQ shooter").status, "unavailable");
    assert.equal(predictions.get("Complete shooter").status, "not_eligible");
    assert.equal(predictions.get("Complete shooter").reason, "all_stages_completed");
});

test("uses the prior when a shooter has completed stages but no positive HF history", () => {
    const shooters = [shooter("Ref A"), shooter("Ref B"), shooter("Zero-only shooter")];
    const results = [
        ...completeReferenceResults(),
        result("Zero-only shooter", 1, 0, { pts: 0, time: 10 }),
    ];

    const prediction = calculatePredictions(shooters, results).get("Zero-only shooter");

    assert.equal(prediction.status, "predicted");
    assert.equal(prediction.completedStageCount, 1);
    assert.equal(prediction.n, 0);
    assert.equal(prediction.averageRelativeHF, undefined);
    assert.equal(prediction.lambda, 0);
    assert.equal(prediction.predictedRelativeHF, 1);
    assert.equal(prediction.stages.find((stage) => stage.stage === 2).predictedHF, 25);
});

test("reports unavailable baselines and rejects invalid HF inputs and options", () => {
    const noReferenceResults = [
        result("Target", 1, 10),
        result("Incomplete", 2, 20),
    ];
    const noReference = calculatePredictions(
        [shooter("Target"), shooter("Incomplete")],
        noReferenceResults,
    ).get("Target");
    assert.equal(noReference.status, "unavailable");
    assert.equal(noReference.reason, "missing_or_non_positive_completed_stage_baseline");
    assert.equal(noReference.stages[0].reason, "no_valid_reference_hf");

    const zeroBaseline = calculatePredictions(
        [shooter("Ref A"), shooter("Ref B"), shooter("Target")],
        [
            result("Ref A", 1, 10),
            result("Ref A", 2, 0, { pts: 0, time: 10 }),
            result("Ref B", 1, 20),
            result("Ref B", 2, 0, { pts: 0, time: 10 }),
            result("Target", 1, 10),
        ],
    ).get("Target");
    assert.equal(zeroBaseline.status, "unavailable");
    assert.equal(zeroBaseline.reason, "missing_or_non_positive_completed_stage_baseline");
    assert.equal(zeroBaseline.stages[0].reason, "no_valid_reference_hf");

    const invalid = calculatePredictions(
        [shooter("Ref A"), shooter("Ref B"), shooter("Target")],
        [
            result("Ref A", 1, 10),
            result("Ref A", 2, 10),
            result("Ref A", 3, 10),
            result("Ref B", 1, 20),
            result("Ref B", 2, 20),
            result("Ref B", 3, 20),
            result("Target", 1, 10),
            result("Target", 2, -1, { pts: -10, time: 10 }),
        ],
    ).get("Target");
    assert.equal(invalid.reason, "invalid_completed_stage_hf");

    const emptyScore = calculatePredictions(
        [shooter("Ref A"), shooter("Ref B"), shooter("Target")],
        [
            result("Ref A", 1, 10),
            result("Ref A", 2, 10),
            result("Ref A", 3, 10),
            result("Ref B", 1, 20),
            result("Ref B", 2, 20),
            result("Ref B", 3, 20),
            result("Target", 1, 10),
            result("Target", 2, 0, { factor: "1.0000", pts: "", time: 10 }),
        ],
    ).get("Target");
    assert.equal(emptyScore.reason, "invalid_completed_stage_hf");

    assert.throws(
        () => calculatePredictions([], [], { k: 0, priorRelativeHF: 1 }),
        /k must be a finite number greater than zero/,
    );
    assert.throws(
        () => calculatePredictions([], [], { k: 2, priorRelativeHF: Number.NaN }),
        /priorRelativeHF must be a finite non-negative number/,
    );
    assert.throws(
        () => calculatePredictions([], [], { k: Number.POSITIVE_INFINITY, priorRelativeHF: 1 }),
        /k must be a finite number greater than zero/,
    );
});

test("adds predicted stage rows without changing official totals or ranking inputs", async () => {
    const shooters = [
        { name: "Ref A", div: "Standard", class_name: "G", cat: null, shooter_id: 1 },
        { name: "Ref B", div: "Standard", class_name: "G", cat: null, shooter_id: 2 },
        { name: "Target", div: "Standard", class_name: "G", cat: null, shooter_id: 3 },
        { name: "No scores", div: "Standard", class_name: "G", cat: null, shooter_id: 4 },
        { name: "Open ref", div: "Open", class_name: "G", cat: null, shooter_id: 5 },
    ];
    const results = [
        ...completeReferenceResults(),
        result("Target", 1, 15),
        result("Target", 3, 20),
        ...[1, 2, 3].map((stage) => result("Open ref", stage, 100)),
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

    const [group] = await calScore(db, 45, "match", "Standard OverAll");
    const target = group.groupResults.find((player) => player.name === "Target");
    const predicted = target.stageResult.find((stage) => stage.isPrediction);

    assert.equal(target.prediction.status, "predicted");
    assert.equal(predicted.stage, 2);
    assert.equal(predicted.factor, "21.8750");
    assert.ok(predicted.stagePoint > 0);
    assert.equal(predicted.predictionDetails.baselineHF, 25);
    assert.equal(target.totalStagePoint, target.stageResult
        .filter((stage) => !stage.isPrediction)
        .reduce((total, stage) => total + stage.stagePoint, 0));
    assert.equal(group.groupResults.find((player) => player.name === "No scores").dq, false);

    const [allGroup] = await calScore(db, 45, "match");
    const allGroupPrediction = allGroup.groupResults
        .find((player) => player.name === "Target")
        .stageResult.find((stage) => stage.isPrediction);
    assert.ok(Math.abs(allGroupPrediction.stagePoint - (21.875 / 30) * 100) < 1e-10);
});
