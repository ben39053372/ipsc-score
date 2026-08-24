import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ScoreGroup, ShooterScore, fetchScore, getDefaultBaseUrl, normalizeBaseUrl } from "../lib/ipscApi";

const formatScore = (value: number) => value.toFixed(4);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export default function PlayerDetailScreen() {
    const params = useLocalSearchParams<{
        matchId?: string;
        baseUrl?: string;
        matchName?: string;
        groupName?: string;
        playerName?: string;
        playerRank?: string;
    }>();

    const matchId = Number(params.matchId);
    const baseUrl = normalizeBaseUrl(params.baseUrl ?? getDefaultBaseUrl());
    const matchName = params.matchName ?? "Selected match";
    const initialGroupName = params.groupName ?? "";
    const playerName = params.playerName ?? "";
    const playerRank = Number(params.playerRank);

    const [scoreGroups, setScoreGroups] = useState<ScoreGroup[]>([]);
    const [selectedGroupName, setSelectedGroupName] = useState<string | null>(initialGroupName || null);
    const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const findPlayerInGroup = useCallback(
        (group: ScoreGroup): ShooterScore | null => {
            const byName = group.groupResults.filter((item) => item.name === playerName);
            if (!byName.length) {
                return null;
            }

            if (Number.isInteger(playerRank) && playerRank > 0) {
                const rankMatched = byName.find((item) => item.rank === playerRank);
                if (rankMatched) {
                    return rankMatched;
                }
            }

            return byName[0];
        },
        [playerName, playerRank],
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

    return (
        <View style={styles.container}>
            <View style={styles.headerCard}>
                <Text style={styles.title}>{matchName}</Text>
                <Text style={styles.helpText}>Group</Text>
                {selectableGroups.length > 0 ? (
                    <View style={styles.groupSelectorWrap}>
                        <Pressable
                            style={styles.groupSelectorButton}
                            onPress={() => setGroupDropdownOpen((prev) => !prev)}
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
                    <Text style={styles.helpText}>No selectable group for this player.</Text>
                )}
                <Pressable onPress={() => void loadPlayerDetail()} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Refresh</Text>
                </Pressable>
            </View>

            <View style={styles.bodyCard}>
                {loading ? <ActivityIndicator /> : null}
                {derivedError ? <Text style={styles.errorText}>{derivedError}</Text> : null}

                {!loading && !derivedError && player ? (
                    <>
                        <View style={styles.playerSummary}>
                            <Text style={styles.playerName}>{player.name}</Text>
                            <Text style={styles.helpText}>Rank #{player.rank}</Text>
                            {headerMeta ? <Text style={styles.helpText}>{headerMeta}</Text> : null}
                            <Text style={styles.helpText}>Total: {formatScore(player.totalStagePoint)}</Text>
                            <Text style={styles.helpText}>Percent: {formatPercent(player.percent)}</Text>
                            {player.dq ? <Text style={styles.dq}>DQ</Text> : null}
                        </View>

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
    },
    playerName: {
        fontSize: 16,
        fontWeight: "700",
        color: "#1d2f4c",
    },
    stageTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1d2f4c",
        marginBottom: 8,
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
        marginTop: 4,
        marginBottom: 2,
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
