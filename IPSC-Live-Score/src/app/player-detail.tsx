import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScoreGroup, ShooterScore, StageResult, fetchScore, getDefaultBaseUrl, normalizeBaseUrl } from "../lib/ipscApi";

const formatScore = (value: number) => value.toFixed(4);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export default function PlayerDetailScreen() {
    const params = useLocalSearchParams<{
        matchId?: string;
        baseUrl?: string;
        matchName?: string;
        groupName?: string;
        playerName?: string;
        playerShooterId?: string;
        playerRank?: string;
    }>();

    const matchId = Number(params.matchId);
    const baseUrl = normalizeBaseUrl(params.baseUrl ?? getDefaultBaseUrl());
    const matchName = params.matchName ?? "Selected match";
    const initialGroupName = params.groupName ?? "";
    const playerName = params.playerName ?? "";
    const playerShooterId = Number(params.playerShooterId);
    const playerRank = Number(params.playerRank);

    const [scoreGroups, setScoreGroups] = useState<ScoreGroup[]>([]);
    const [selectedGroupName, setSelectedGroupName] = useState<string | null>(initialGroupName || null);
    const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
    const [compareInput, setCompareInput] = useState("");
    const [compareTargetShooterId, setCompareTargetShooterId] = useState<number | null>(null);
    const [compareError, setCompareError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const findPlayerInGroup = useCallback(
        (group: ScoreGroup): ShooterScore | null => {
            const byName = group.groupResults.filter((item) => item.name === playerName);
            if (!byName.length) {
                return null;
            }

            if (Number.isInteger(playerShooterId) && playerShooterId > 0) {
                const idMatched = byName.find((item) => item.shooter_id === playerShooterId);
                if (idMatched) {
                    return idMatched;
                }
            }

            if (Number.isInteger(playerRank) && playerRank > 0) {
                const rankMatched = byName.find((item) => item.rank === playerRank);
                if (rankMatched) {
                    return rankMatched;
                }
            }

            return byName[0];
        },
        [playerName, playerRank, playerShooterId],
    );

    const loadPlayerDetail = useCallback(async () => {
        if (!Number.isInteger(matchId) || matchId <= 0) {
            setError("Invalid match id.");
            setScoreGroups([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const groups = await fetchScore(baseUrl, matchId);
            setScoreGroups(groups);
        } catch (caughtError) {
            const message = caughtError instanceof Error ? caughtError.message : "Failed to load player detail";
            setError(message);
            setScoreGroups([]);
        } finally {
            setLoading(false);
        }
    }, [baseUrl, matchId]);

    useEffect(() => {
        void loadPlayerDetail();
    }, [loadPlayerDetail]);

    const selectableGroups = useMemo(
        () => scoreGroups.filter((group) => findPlayerInGroup(group) !== null),
        [scoreGroups, findPlayerInGroup],
    );

    useEffect(() => {
        if (!selectableGroups.length) {
            setSelectedGroupName(null);
            return;
        }

        const stillExists = selectedGroupName !== null && selectableGroups.some((group) => group.groupName === selectedGroupName);
        if (stillExists) {
            return;
        }

        if (initialGroupName && selectableGroups.some((group) => group.groupName === initialGroupName)) {
            setSelectedGroupName(initialGroupName);
            return;
        }

        setSelectedGroupName(selectableGroups[0].groupName);
        Keyboard.dismiss();
    }, [initialGroupName, selectableGroups, selectedGroupName]);

    const player = useMemo(() => {
        if (!selectedGroupName) {
            return null;
        }

        const group = selectableGroups.find((item) => item.groupName === selectedGroupName);
        if (!group) {
            return null;
        }

        return findPlayerInGroup(group);
    }, [findPlayerInGroup, selectableGroups, selectedGroupName]);

    const selectedGroup = useMemo(() => {
        if (!selectedGroupName) {
            return null;
        }
        return selectableGroups.find((group) => group.groupName === selectedGroupName) ?? null;
    }, [selectableGroups, selectedGroupName]);

    const comparePlayer = useMemo(() => {
        if (!selectedGroup || compareTargetShooterId === null) {
            return null;
        }
        return selectedGroup.groupResults.find((item) => item.shooter_id === compareTargetShooterId) ?? null;
    }, [selectedGroup, compareTargetShooterId]);

    const comparisonRows = useMemo(() => {
        if (!player || !comparePlayer) {
            return [] as Array<{ stage: number; left?: StageResult; right?: StageResult }>;
        }

        const stageMap = new Map<number, { stage: number; left?: StageResult; right?: StageResult }>();

        for (const stage of player.stageResult) {
            stageMap.set(stage.stage, { stage: stage.stage, left: stage });
        }

        for (const stage of comparePlayer.stageResult) {
            const current = stageMap.get(stage.stage);
            if (current) {
                current.right = stage;
            } else {
                stageMap.set(stage.stage, { stage: stage.stage, right: stage });
            }
        }

        return [...stageMap.values()].sort((a, b) => a.stage - b.stage);
    }, [comparePlayer, player]);

    useEffect(() => {
        setCompareInput("");
        setCompareTargetShooterId(null);
        setCompareError(null);
    }, [selectedGroupName, player?.name, player?.rank, player?.shooter_id]);

    const applyCompare = useCallback(() => {
        if (!selectedGroup) {
            setCompareError("Please select a group first.");
            return;
        }

        const parsed = Number.parseInt(compareInput.trim(), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            setCompareError("Please enter a valid shooter ID.");
            return;
        }

        const target = selectedGroup.groupResults.find((item) => item.shooter_id === parsed);
        if (!target) {
            setCompareError("Shooter ID not found in this group.");
            setCompareTargetShooterId(null);
            return;
        }

        if (player && target.shooter_id === player.shooter_id) {
            setCompareError("This is the current player. Enter a different shooter ID.");
            setCompareTargetShooterId(null);
            return;
        }

        setCompareError(null);
        setCompareTargetShooterId(parsed);
    }, [compareInput, player, selectedGroup]);

    const derivedError = useMemo(() => {
        if (error) {
            return error;
        }
        if (!loading && scoreGroups.length > 0 && !selectableGroups.length) {
            return "Player not found in any group.";
        }
        if (!loading && selectableGroups.length > 0 && !player) {
            return "Player not found in selected group.";
        }
        return null;
    }, [error, loading, player, scoreGroups.length, selectableGroups.length]);

    const headerMeta = useMemo(() => {
        if (!player) {
            return null;
        }
        const cat = player.cat ? ` · ${player.cat}` : "";
        return `${player.div} · ${player.class_name}${cat}`;
    }, [player]);

    const summaryComparison = useMemo(() => {
        if (!player || !comparePlayer) {
            return null;
        }

        return {
            leftBetterTotal: player.totalStagePoint > comparePlayer.totalStagePoint,
            rightBetterTotal: player.totalStagePoint < comparePlayer.totalStagePoint,
            leftBetterPercent: player.percent > comparePlayer.percent,
            rightBetterPercent: player.percent < comparePlayer.percent,
        };
    }, [comparePlayer, player]);

    return (
        <View style={styles.container}>
            <View style={styles.headerCard}>
                <Text style={styles.title}>{matchName}</Text>
                <Text style={styles.helpText}>Group</Text>
                <View style={styles.groupControlRow}>
                    {selectableGroups.length > 0 ? (
                        <View style={styles.groupSelectorWrap}>
                            <Pressable
                                style={styles.groupSelectorButton}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setGroupDropdownOpen((prev) => !prev)
                                }}
                            >
                                <Text style={styles.groupSelectorButtonText}>{selectedGroupName ?? "Select a group"}</Text>
                                <Text style={styles.groupSelectorChevron}>{groupDropdownOpen ? "▲" : "▼"}</Text>
                            </Pressable>
                            {groupDropdownOpen ? (
                                <View style={styles.groupDropdownPanel}>
                                    {selectableGroups.map((group) => {
                                        const selected = selectedGroupName === group.groupName;
                                        return (
                                            <Pressable
                                                key={group.groupName}
                                                style={[styles.groupOption, selected && styles.groupOptionSelected]}
                                                onPress={() => {
                                                    Keyboard.dismiss();
                                                    setSelectedGroupName(group.groupName);
                                                    setGroupDropdownOpen(false);
                                                }}
                                            >
                                                <Text style={[styles.groupOptionText, selected && styles.groupOptionTextSelected]}>
                                                    {group.groupName}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </View>
                    ) : (
                        <View style={styles.groupSelectorWrap}>
                            <Text style={styles.helpText}>No selectable group for this player.</Text>
                        </View>
                    )}
                    <Pressable onPress={() => void loadPlayerDetail()} style={[styles.secondaryButton, styles.headerRefreshButton]}>
                        <Text style={styles.secondaryButtonText}>Refresh</Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.bodyCard}>
                {loading ? <ActivityIndicator /> : null}
                {derivedError ? <Text style={styles.errorText}>{derivedError}</Text> : null}

                <View style={styles.compareControlRow}>
                    <TextInput
                        style={styles.compareInput}
                        placeholder="Shooter ID"
                        keyboardType="number-pad"
                        value={compareInput}
                        onChangeText={setCompareInput}
                    />
                    <Pressable onPress={() => {
                        Keyboard.dismiss();
                        applyCompare();
                    }} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Compare</Text>
                    </Pressable>
                </View>
                {compareError ? <Text style={styles.errorText}>{compareError}</Text> : null}

                {!loading && !derivedError && player ? (
                    <>
                        <View style={styles.playerSummary}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.helpText}>Shooter ID {player.shooter_id ?? "N/A"}</Text>
                                <Text style={styles.helpText}>Rank #{player.rank}</Text>
                                {headerMeta ? <Text style={styles.helpText}>{headerMeta}</Text> : null}
                                <Text style={styles.helpText}>Total: {formatScore(player.totalStagePoint)}</Text>
                                <Text style={styles.helpText}>Percent: {formatPercent(player.percent)}</Text>
                                {player.dq ? <Text style={styles.dq}>DQ</Text> : null}
                            </View>

                            {comparePlayer && summaryComparison ? (
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.playerName}>{comparePlayer.name}</Text>
                                    <Text style={styles.helpText}>Shooter ID {comparePlayer.shooter_id ?? "N/A"}</Text>
                                    <Text style={styles.helpText}>Rank #{comparePlayer.rank}</Text>
                                    {headerMeta ? <Text style={styles.helpText}>{headerMeta}</Text> : null}
                                    <Text style={styles.helpText}>Total: {formatScore(comparePlayer.totalStagePoint)}</Text>
                                    <Text style={styles.helpText}>Percent: {formatPercent(comparePlayer.percent)}</Text>
                                    {comparePlayer.dq ? <Text style={styles.dq}>DQ</Text> : null}
                                </View>
                            ) : null}
                        </View>



                        {comparePlayer ? (
                            <>
                                <Text style={styles.stageTitle}>Stage Comparison</Text>
                                <View style={styles.compareHeaderRow}>
                                    <Text style={styles.compareHeaderText}>{player.name} (ID {player.shooter_id ?? "N/A"})</Text>
                                    <Text style={styles.compareHeaderText}>{comparePlayer.name} (ID {comparePlayer.shooter_id ?? "N/A"})</Text>
                                </View>
                                <FlatList
                                    data={comparisonRows}
                                    keyExtractor={(item) => `compare-stage-${item.stage}`}
                                    contentContainerStyle={styles.stageListContent}
                                    renderItem={({ item }) => (
                                        <View style={styles.compareStageRow}>
                                            <Text style={styles.stageHeading}>Stage {item.stage}</Text>
                                            <View style={styles.compareColumns}>
                                                <View
                                                    style={[
                                                        styles.compareCard,
                                                        (() => {
                                                            const leftPoint = item.left?.stagePoint ?? -1;
                                                            const rightPoint = item.right?.stagePoint ?? -1;
                                                            if (leftPoint > rightPoint) return styles.compareCardBetter;
                                                            if (leftPoint < rightPoint) return styles.compareCardWorse;
                                                            return null;
                                                        })(),
                                                    ]}
                                                >
                                                    <Text style={styles.helpText}>Factor: {item.left?.factor ?? "-"}</Text>
                                                    <Text style={styles.helpText}>Pts: {item.left?.pts ?? "-"}</Text>
                                                    <Text style={styles.helpText}>A/C/D: {item.left ? `${item.left.a}/${item.left.c}/${item.left.d}` : "-"}</Text>
                                                    <Text style={styles.helpText}>MI/NS/PE: {item.left ? `${item.left.mi}/${item.left.ns}/${item.left.pe}` : "-"}</Text>
                                                    <Text style={styles.helpText}>Time: {item.left?.time ?? "-"}</Text>
                                                    <Text style={styles.helpText}>Stage Point: {item.left ? formatScore(item.left.stagePoint) : "-"}</Text>
                                                </View>
                                                <View
                                                    style={[
                                                        styles.compareCard,
                                                        (() => {
                                                            const leftPoint = item.left?.stagePoint ?? -1;
                                                            const rightPoint = item.right?.stagePoint ?? -1;
                                                            if (rightPoint > leftPoint) return styles.compareCardBetter;
                                                            if (rightPoint < leftPoint) return styles.compareCardWorse;
                                                            return null;
                                                        })(),
                                                    ]}
                                                >
                                                    <Text style={styles.helpText}>Factor: {item.right?.factor ?? "-"}</Text>
                                                    <Text style={styles.helpText}>Pts: {item.right?.pts ?? "-"}</Text>
                                                    <Text style={styles.helpText}>A/C/D: {item.right ? `${item.right.a}/${item.right.c}/${item.right.d}` : "-"}</Text>
                                                    <Text style={styles.helpText}>MI/NS/PE: {item.right ? `${item.right.mi}/${item.right.ns}/${item.right.pe}` : "-"}</Text>
                                                    <Text style={styles.helpText}>Time: {item.right?.time ?? "-"}</Text>
                                                    <Text style={styles.helpText}>Stage Point: {item.right ? formatScore(item.right.stagePoint) : "-"}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                />
                            </>
                        ) : (
                            <>
                                <Text style={styles.stageTitle}>Stage Details</Text>
                                <FlatList
                                    data={player.stageResult}
                                    keyExtractor={(item) => `stage-${item.stage}`}
                                    contentContainerStyle={styles.stageListContent}
                                    renderItem={({ item }) => (
                                        <View style={styles.stageItem}>
                                            <Text style={styles.stageHeading}>Stage {item.stage}</Text>
                                            <Text style={styles.helpText}>Factor: {item.factor}</Text>
                                            <Text style={styles.helpText}>Pts: {item.pts}</Text>
                                            <Text style={styles.helpText}>A/C/D: {item.a}/{item.c}/{item.d}</Text>
                                            <Text style={styles.helpText}>MI/NS/PE: {item.mi}/{item.ns}/{item.pe}</Text>
                                            <Text style={styles.helpText}>Time: {item.time}</Text>
                                            <Text style={styles.helpText}>Stage Point: {formatScore(item.stagePoint)}</Text>
                                        </View>
                                    )}
                                />
                            </>
                        )}
                    </>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#eef3fb",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        gap: 12,
    },
    headerCard: {
        backgroundColor: "#ffffff",
        borderRadius: 14,
        padding: 12,
        borderColor: "#d2ddf0",
        borderWidth: 1,
        gap: 6,
    },
    bodyCard: {
        flex: 1,
        backgroundColor: "#ffffff",
        borderRadius: 14,
        padding: 12,
        borderColor: "#d2ddf0",
        borderWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        color: "#16243b",
    },
    playerSummary: {
        borderWidth: 1,
        borderColor: "#d8e0ef",
        borderRadius: 10,
        backgroundColor: "#f7f9fe",
        padding: 10,
        marginBottom: 10,
        gap: 2,
        flexDirection: "row",

    },
    playerName: {
        fontSize: 12,
        fontWeight: "700",
        color: "#1d2f4c",
    },
    playerCompareSummaryWrap: {
        marginTop: 8,
        gap: 6,
    },
    metricCompareRow: {
        flexDirection: "row",
        gap: 8,
        alignItems: "stretch",
    },
    metricLabel: {
        width: 52,
        fontSize: 13,
        fontWeight: "700",
        color: "#1d2f4c",
        textAlignVertical: "center",
    },
    metricValueBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#d8e0ef",
        borderRadius: 8,
        backgroundColor: "#ffffff",
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 2,
    },
    metricValueText: {
        color: "#1d2f4c",
        fontWeight: "700",
    },
    stageTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1d2f4c",
        marginBottom: 8,
    },
    compareControlRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    compareInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#c7d5eb",
        borderRadius: 8,
        backgroundColor: "#f7f9fe",
        paddingHorizontal: 10,
        paddingVertical: 10,
        color: "#1d2f4c",
    },
    compareHeaderRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 8,
    },
    compareHeaderText: {
        flex: 1,
        fontSize: 12,
        fontWeight: "700",
        color: "#1d2f4c",
        backgroundColor: "#e9f0fe",
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    compareStageRow: {
        borderWidth: 1,
        borderColor: "#d8e0ef",
        borderRadius: 10,
        backgroundColor: "#f7f9fe",
        padding: 10,
        gap: 8,
    },
    compareColumns: {
        flexDirection: "row",
        gap: 8,
    },
    compareCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#d8e0ef",
        borderRadius: 8,
        backgroundColor: "#ffffff",
        padding: 8,
        gap: 2,
    },
    compareCardBetter: {
        backgroundColor: "#e7f8ea",
        borderColor: "#9fd9aa",
    },
    compareCardWorse: {
        backgroundColor: "#fdecec",
        borderColor: "#efb5b5",
    },
    stageListContent: {
        paddingBottom: 18,
        gap: 8,
    },
    stageItem: {
        borderWidth: 1,
        borderColor: "#d8e0ef",
        borderRadius: 10,
        backgroundColor: "#f7f9fe",
        padding: 10,
        gap: 2,
    },
    stageHeading: {
        fontWeight: "700",
        color: "#1d2f4c",
        marginBottom: 2,
    },
    groupSelectorWrap: {
        flex: 1,
    },
    groupControlRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    groupSelectorButton: {
        borderWidth: 1,
        borderColor: "#c7d5eb",
        borderRadius: 8,
        backgroundColor: "#f7f9fe",
        paddingHorizontal: 10,
        paddingVertical: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
    },
    groupSelectorButtonText: {
        color: "#1d2f4c",
        fontWeight: "600",
        flex: 1,
    },
    groupSelectorChevron: {
        color: "#1d2f4c",
        fontSize: 12,
    },
    groupDropdownPanel: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: "#c7d5eb",
        borderRadius: 8,
        backgroundColor: "#ffffff",
        overflow: "hidden",
    },
    groupOption: {
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#edf2fb",
    },
    groupOptionSelected: {
        backgroundColor: "#ebf2ff",
    },
    groupOptionText: {
        color: "#1d2f4c",
        fontSize: 13,
    },
    groupOptionTextSelected: {
        color: "#103d84",
        fontWeight: "600",
    },
    helpText: {
        color: "#465771",
        fontSize: 13,
    },
    errorText: {
        color: "#b32323",
        marginBottom: 6,
    },
    secondaryButton: {
        marginTop: 4,
        alignSelf: "flex-start",
        backgroundColor: "#245fb7",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
    },
    headerRefreshButton: {
        marginTop: 0,
    },
    secondaryButtonText: {
        color: "#ffffff",
        fontWeight: "600",
    },
    dq: {
        marginTop: 2,
        color: "#b32323",
        fontSize: 12,
        fontWeight: "700",
    },
});
