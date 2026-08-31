import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	SectionList,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { AdsIDs } from "@/lib/adids";
import { AdBanner } from "../components/AdBanner";
import {
	fetchScore,
	getDefaultBaseUrl,
	normalizeBaseUrl,
	type ScoreGroup,
} from "../lib/ipscApi";

const formatScore = (value: number) => value.toFixed(4);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export default function LeaderboardScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{
		matchId?: string;
		baseUrl?: string;
		matchName?: string;
		href?: string;
	}>();

	const matchId = Number(params.matchId);
	const baseUrl = normalizeBaseUrl(params.baseUrl ?? getDefaultBaseUrl());
	const matchName = params.matchName ?? "Selected match";
	const href = params.href ?? "";

	const [scoreGroups, setScoreGroups] = useState<ScoreGroup[]>([]);
	const [scoreLoading, setScoreLoading] = useState(false);
	const [scoreError, setScoreError] = useState<string | null>(null);
	const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
		null,
	);
	const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

	const loadScore = useCallback(async () => {
		if (!Number.isInteger(matchId) || matchId <= 0) {
			setScoreError("Invalid match id.");
			setScoreGroups([]);
			return;
		}

		setScoreLoading(true);
		setScoreError(null);

		try {
			const data = await fetchScore(baseUrl, matchId, href);
			setScoreGroups(data);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load score";
			setScoreError(message);
			setScoreGroups([]);
		} finally {
			setScoreLoading(false);
		}
	}, [baseUrl, matchId, href]);

	useEffect(() => {
		void loadScore();
	}, [loadScore]);

	useEffect(() => {
		if (!scoreGroups.length) {
			setSelectedGroupName(null);
			return;
		}

		const stillExists =
			selectedGroupName !== null &&
			scoreGroups.some((group) => group.groupName === selectedGroupName);
		if (!stillExists) {
			setSelectedGroupName(scoreGroups[0].groupName);
		}
	}, [scoreGroups, selectedGroupName]);

	const scoreSections = useMemo(() => {
		if (!selectedGroupName) {
			return [];
		}

		const group = scoreGroups.find(
			(item) => item.groupName === selectedGroupName,
		);
		if (!group) {
			return [];
		}

		return [
			{
				title: group.groupName,
				data: group.groupResults,
			},
		];
	}, [scoreGroups, selectedGroupName]);

	return (
		<View style={styles.container}>
			<View style={styles.headerCard}>
				<Text style={styles.title}>{matchName}</Text>
				<Text style={styles.helpText}>Match #{matchId}</Text>
				<Pressable
					onPress={() => void loadScore()}
					style={styles.secondaryButton}
				>
					<Text style={styles.secondaryButtonText}>Refresh Score</Text>
				</Pressable>
			</View>

			<View style={styles.scoreCard}>
				{scoreLoading ? <ActivityIndicator /> : null}
				{scoreError ? <Text style={styles.errorText}>{scoreError}</Text> : null}
				{!scoreLoading && !scoreError && scoreGroups.length === 0 ? (
					<Text style={styles.helpText}>No score data for this match.</Text>
				) : null}

				{scoreGroups.length > 0 ? (
					<View style={styles.groupSelectorWrap}>
						<Text style={styles.groupSelectorLabel}>Group</Text>
						<Pressable
							style={styles.groupSelectorButton}
							onPress={() => setGroupDropdownOpen((prev) => !prev)}
						>
							<Text style={styles.groupSelectorButtonText}>
								{selectedGroupName ?? "Select a group"}
							</Text>
							<Text style={styles.groupSelectorChevron}>
								{groupDropdownOpen ? "▲" : "▼"}
							</Text>
						</Pressable>
						{groupDropdownOpen ? (
							<ScrollView style={styles.groupDropdownPanel}>
								{scoreGroups.map((group) => {
									const selected = selectedGroupName === group.groupName;
									return (
										<Pressable
											key={group.groupName}
											style={[
												styles.groupOption,
												selected && styles.groupOptionSelected,
											]}
											onPress={() => {
												setSelectedGroupName(group.groupName);
												setGroupDropdownOpen(false);
											}}
										>
											<Text
												style={[
													styles.groupOptionText,
													selected && styles.groupOptionTextSelected,
												]}
											>
												{group.groupName}
											</Text>
										</Pressable>
									);
								})}
							</ScrollView>
						) : null}
					</View>
				) : null}

				<SectionList
					sections={scoreSections}
					keyExtractor={(item, index) => `${item.name}-${index}`}
					stickySectionHeadersEnabled={false}
					contentContainerStyle={styles.scoreListContent}
					renderSectionHeader={({ section }) => (
						<Text style={styles.groupHeader}>{section.title}</Text>
					)}
					renderItem={({ item }) => (
						<Pressable
							style={styles.shooterRow}
							onPress={() => {
								router.push({
									pathname: "/player-detail",
									params: {
										matchId: String(matchId),
										href: href,
										baseUrl,
										matchName,
										groupName: selectedGroupName ?? "",
										playerName: item.name,
										playerShooterId: item.shooter_id
											? String(item.shooter_id)
											: "",
										playerRank: String(item.rank),
									},
								});
							}}
						>
							<View style={styles.shooterMain}>
								<Text style={styles.rank}>#{item.rank}</Text>
								<View style={styles.shooterTextWrap}>
									<Text style={styles.shooterName}>{item.name}</Text>
									<Text style={styles.shooterMeta}>
										{item.div} · {item.class_name}
										{item.cat ? ` · ${item.cat}` : ""}
										{item.shooter_id ? ` · ID ${item.shooter_id}` : ""}
									</Text>
								</View>
							</View>
							<View style={styles.scoreValues}>
								<Text style={styles.scoreValue}>
									{formatScore(item.totalStagePoint)}
								</Text>
								<Text style={styles.percent}>
									{formatPercent(item.percent)}
								</Text>
								{item.dq ? <Text style={styles.dq}>DQ</Text> : null}
							</View>
						</Pressable>
					)}
				/>
			</View>
			<AdBanner
				adUnitId={
					Platform.OS === "ios"
						? AdsIDs.LEADERBOARD_BANNER.ios
						: AdsIDs.LEADERBOARD_BANNER.android
				}
			/>
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
	scoreCard: {
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
	scoreListContent: {
		paddingBottom: 18,
	},
	groupSelectorWrap: {
		marginBottom: 8,
	},
	groupSelectorLabel: {
		fontSize: 12,
		color: "#566984",
		marginBottom: 6,
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
		maxHeight: "80%",
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
	groupHeader: {
		marginTop: 10,
		marginBottom: 6,
		fontSize: 15,
		fontWeight: "700",
		color: "#1d2f4c",
	},
	shooterRow: {
		borderWidth: 1,
		borderColor: "#d8e0ef",
		borderRadius: 10,
		backgroundColor: "#f7f9fe",
		padding: 10,
		marginBottom: 8,
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 8,
	},
	shooterMain: {
		flexDirection: "row",
		alignItems: "flex-start",
		flex: 1,
		gap: 8,
	},
	shooterTextWrap: {
		flex: 1,
	},
	rank: {
		fontWeight: "700",
		color: "#1f3a66",
		minWidth: 34,
	},
	shooterName: {
		fontSize: 15,
		fontWeight: "700",
		color: "#1d2f4c",
	},
	shooterMeta: {
		color: "#566984",
		fontSize: 12,
		marginTop: 2,
	},
	scoreValues: {
		alignItems: "flex-end",
	},
	scoreValue: {
		fontWeight: "700",
		color: "#1d2f4c",
	},
	percent: {
		fontSize: 12,
		color: "#556881",
	},
	dq: {
		marginTop: 2,
		color: "#b32323",
		fontSize: 12,
		fontWeight: "700",
	},
});
