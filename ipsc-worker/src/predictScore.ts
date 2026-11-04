export type PredictionOptions = {
    k: number;
    priorRelativeHF: number;
};

export const DEFAULT_PREDICTION_OPTIONS: Readonly<PredictionOptions> = Object.freeze({
    k: 2,
    priorRelativeHF: 1,
});

export type PredictionStageResult = {
    stage: number;
    status: "predicted" | "unavailable";
    baselineHF?: number;
    predictedHF?: number;
    predictedStagePoint?: number;
    reason?: string;
};

export type ShooterPrediction = {
    status: "predicted" | "not_eligible" | "unavailable";
    reason?: string;
    completedStageCount: number;
    totalStageCount: number;
    n: number;
    averageRelativeHF?: number;
    lambda: number;
    k: number;
    priorRelativeHF: number;
    predictedRelativeHF?: number;
    referenceShooterCount: number;
    stages: PredictionStageResult[];
};

type Shooter = {
    name: string;
    div: string;
};

type ScoreRow = {
    name: string;
    stage: number;
    factor: string;
    pts: string;
    time: string;
};

type StageHF = {
    hf: number;
};

const isValidHF = (row: ScoreRow): number | null => {
    if (
        typeof row.pts !== "string" ||
        typeof row.time !== "string" ||
        row.pts.trim() === "" ||
        row.time.trim() === ""
    ) {
        return null;
    }
    const points = Number(row.pts);
    const time = Number(row.time);
    if (!Number.isFinite(points) || points < 0 || !Number.isFinite(time) || time <= 0) {
        return null;
    }

    const hf = points / time;
    return Number.isFinite(hf) && hf >= 0 ? hf : null;
};

export const isDisqualified = (rows: ScoreRow[]): boolean =>
    rows.length > 0 && rows.every((row) => row.factor === "0.0000" && row.pts !== "0");

const median = (values: number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
};

export const validatePredictionOptions = (options: PredictionOptions): void => {
    if (!Number.isFinite(options.k) || options.k <= 0) {
        throw new Error("Prediction k must be a finite number greater than zero.");
    }
    if (!Number.isFinite(options.priorRelativeHF) || options.priorRelativeHF < 0) {
        throw new Error("Prediction priorRelativeHF must be a finite non-negative number.");
    }
};

const unavailablePrediction = (
    status: ShooterPrediction["status"],
    reason: string,
    completedStageCount: number,
    totalStageCount: number,
    options: PredictionOptions,
    referenceShooterCount: number,
    stages: PredictionStageResult[] = [],
    n = completedStageCount,
): ShooterPrediction => ({
    status,
    reason,
    completedStageCount,
    totalStageCount,
    n,
    lambda: n / (n + options.k),
    k: options.k,
    priorRelativeHF: options.priorRelativeHF,
    referenceShooterCount,
    stages,
});

/**
 * Predicts missing stages with division-specific stage medians from one fixed
 * reference cohort of non-DQ shooters who have a positive HF for every known stage.
 *
 * Defaults: k = 2 and priorRelativeHF = 1.0.
 * r_i,s = HF_i,s / B_s; rBar_i is the mean of completed-stage relative HFs.
 * lambda_i = n_i / (n_i + k); rHat_i = lambda_i*rBar_i + (1-lambda_i)*r0.
 * Predicted HF is B_s*rHat_i. Missing rows are treated as not shot; invalid
 * present rows, zero HF values, DQ shooters, and absent/invalid baselines are
 * excluded from relative-HF calculations or prediction as appropriate.
 */
export const calculatePredictions = (
    shooters: Shooter[],
    results: ScoreRow[],
    options: PredictionOptions = DEFAULT_PREDICTION_OPTIONS,
): Map<string, ShooterPrediction> => {
    validatePredictionOptions(options);

    const stages = [...new Set(
        results.map((row) => row.stage).filter((stage) => Number.isSafeInteger(stage) && stage > 0),
    )].sort((left, right) => left - right);
    const resultsByShooter = new Map<string, ScoreRow[]>();
    for (const row of results) {
        const rows = resultsByShooter.get(row.name) ?? [];
        rows.push(row);
        resultsByShooter.set(row.name, rows);
    }

    const predictions = new Map<string, ShooterPrediction>();
    const divisions = new Map<string, Shooter[]>();
    for (const shooter of shooters) {
        const divisionShooters = divisions.get(shooter.div) ?? [];
        divisionShooters.push(shooter);
        divisions.set(shooter.div, divisionShooters);
    }

    for (const divisionShooters of divisions.values()) {
        const validRowsByShooter = new Map<string, Map<number, StageHF>>();
        const referenceShooters: Shooter[] = [];

        if (stages.length > 0) {
            for (const shooter of divisionShooters) {
                const shooterRows = resultsByShooter.get(shooter.name) ?? [];
                if (isDisqualified(shooterRows)) {
                    continue;
                }

                const stageHFs = new Map<number, StageHF>();
                let allStagesValid = true;
                for (const stage of stages) {
                    const row = shooterRows.find((candidate) => candidate.stage === stage);
                    const hf = row ? isValidHF(row) : null;
                    if (hf === null || hf <= 0) {
                        allStagesValid = false;
                        break;
                    }
                    stageHFs.set(stage, { hf });
                }
                if (allStagesValid) {
                    referenceShooters.push(shooter);
                    validRowsByShooter.set(shooter.name, stageHFs);
                }
            }
        }

        const baselineByStage = new Map<number, number>();
        for (const stage of stages) {
            const stageHFs = referenceShooters.flatMap((shooter) => {
                const hf = validRowsByShooter.get(shooter.name)?.get(stage)?.hf;
                return hf === undefined ? [] : [hf];
            });
            if (stageHFs.length > 0) {
                baselineByStage.set(stage, median(stageHFs));
            }
        }

        for (const shooter of divisionShooters) {
            const shooterRows = resultsByShooter.get(shooter.name) ?? [];
            const completedStageHFs = new Map<number, number>();
            const completedStages = new Set<number>();
            let hasInvalidPresentResult = false;
            for (const row of shooterRows) {
                const hf = isValidHF(row);
                if (hf === null) {
                    hasInvalidPresentResult = true;
                } else if (Number.isSafeInteger(row.stage) && stages.includes(row.stage)) {
                    completedStages.add(row.stage);
                    if (hf > 0) {
                        completedStageHFs.set(row.stage, hf);
                    }
                }
            }

            const completedStageCount = completedStages.size;
            const missingStages = stages.filter((stage) => !shooterRows.some((row) => row.stage === stage));
            const referenceShooterCount = referenceShooters.length;

            if (isDisqualified(shooterRows)) {
                predictions.set(shooter.name, unavailablePrediction(
                    "unavailable",
                    "shooter_disqualified",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }
            if (stages.length === 0) {
                predictions.set(shooter.name, unavailablePrediction(
                    "unavailable",
                    "no_stage_data",
                    completedStageCount,
                    0,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }
            if (completedStageCount === 0) {
                predictions.set(shooter.name, unavailablePrediction(
                    "not_eligible",
                    "no_completed_stages",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }
            if (missingStages.length === 0) {
                predictions.set(shooter.name, unavailablePrediction(
                    "not_eligible",
                    "all_stages_completed",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }
            if (hasInvalidPresentResult) {
                predictions.set(shooter.name, unavailablePrediction(
                    "unavailable",
                    "invalid_completed_stage_hf",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }

            let relativeHFSum = 0;
            let canCalculateAverage = true;
            for (const [stage, hf] of completedStageHFs) {
                const baselineHF = baselineByStage.get(stage);
                if (baselineHF === undefined || baselineHF <= 0) {
                    canCalculateAverage = false;
                    break;
                }
                relativeHFSum += hf / baselineHF;
            }
            if (!canCalculateAverage) {
                const unavailableStages = missingStages.map((stage): PredictionStageResult => {
                    const baselineHF = baselineByStage.get(stage);
                    return {
                        stage,
                        status: "unavailable",
                        ...(baselineHF === undefined ? {} : { baselineHF }),
                        reason: baselineHF === undefined
                            ? "no_valid_reference_hf"
                            : "non_positive_reference_hf",
                    };
                });
                predictions.set(shooter.name, unavailablePrediction(
                    "unavailable",
                    "missing_or_non_positive_completed_stage_baseline",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    unavailableStages,
                    completedStageHFs.size,
                ));
                continue;
            }

            const n = completedStageHFs.size;
            const lambda = n / (n + options.k);
            const averageRelativeHF = n > 0 ? relativeHFSum / n : undefined;
            const predictedRelativeHF =
                lambda * (averageRelativeHF ?? options.priorRelativeHF)
                + (1 - lambda) * options.priorRelativeHF;
            if (!Number.isFinite(predictedRelativeHF) || predictedRelativeHF < 0) {
                predictions.set(shooter.name, unavailablePrediction(
                    "unavailable",
                    "invalid_predicted_relative_hf",
                    completedStageCount,
                    stages.length,
                    options,
                    referenceShooterCount,
                    [],
                    completedStageHFs.size,
                ));
                continue;
            }

            const predictedStages = missingStages.map((stage): PredictionStageResult => {
                const baselineHF = baselineByStage.get(stage);
                if (baselineHF === undefined || baselineHF <= 0) {
                    return {
                        stage,
                        status: "unavailable",
                        reason: baselineHF === undefined
                            ? "no_valid_reference_hf"
                            : "non_positive_reference_hf",
                    };
                }
                const predictedHF = baselineHF * predictedRelativeHF;
                if (!Number.isFinite(predictedHF) || predictedHF < 0) {
                    return { stage, status: "unavailable", reason: "invalid_predicted_hf" };
                }
                return { stage, status: "predicted", baselineHF, predictedHF };
            });
            const hasPredictedStage = predictedStages.some((stage) => stage.status === "predicted");

            predictions.set(shooter.name, {
                status: hasPredictedStage ? "predicted" : "unavailable",
                ...(hasPredictedStage ? {} : { reason: "no_predictable_remaining_stage" }),
                completedStageCount,
                totalStageCount: stages.length,
                n,
                ...(averageRelativeHF === undefined ? {} : { averageRelativeHF }),
                lambda,
                k: options.k,
                priorRelativeHF: options.priorRelativeHF,
                predictedRelativeHF,
                referenceShooterCount,
                stages: predictedStages,
            });
        }

    }

    return predictions;
};
