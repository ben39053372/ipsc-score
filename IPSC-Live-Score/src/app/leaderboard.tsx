import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	SectionList,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { AdsIDs } from "@/lib/adids";
import { AdBanner } from "../components/AdBanner";
import {
	fetchScore,
	getDefaultBaseUrl,
	normalizeBaseUrl,
	type ScoreGroup,
	type ShooterScore,
	type StageResult,
} from "../lib/ipscApi";

const formatScore = (value: number) => value.toFixed(4);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

type FakeRecordInput = {
	stage: string;
	a: string;
	c: string;
	d: string;
	miss: string;
	noShoot: string;
	pe: string;
	time: string;
};

const emptyFakeRecord: FakeRecordInput = {
	stage: "",
	a: "",
	c: "",
	d: "",
	miss: "0",
	noShoot: "0",
	pe: "0",
	time: "",
};

const fakeRecordFields: {
	key: keyof FakeRecordInput;
	label: string;
	decimal?: boolean;
}[] = [
	{ key: "stage", label: "Stage" },
	{ key: "a", label: "A" },
	{ key: "c", label: "C" },
	{ key: "d", label: "D" },
	{ key: "miss", label: "Miss" },
	{ key: "noShoot", label: "No Shoot" },
	{ key: "pe", label: "Procedural Penalty (PE)" },
	{ key: "time", label: "Time (seconds)", decimal: true },
];

const createStageRecord = (
	input: FakeRecordInput,
	shooterName: string,
	groupResults: ShooterScore[],
): StageResult => {
	const readCount = (label: string, value: string, allowZero = true) => {
		if (!/^\d+$/.test(value.trim())) {
			throw new Error(`${label} must be a whole number.`);
		}
		const count = Number(value);
		if (!Number.isSafeInteger(count) || (!allowZero && count < 1)) {
			throw new Error(`${label} must be ${allowZero ? "zero or more" : "at least 1"}.`);
		}
		return count;
	};
	const stage = readCount("Stage", input.stage, false);
	const a = readCount("A", input.a);
	const c = readCount("C", input.c);
	const d = readCount("D", input.d);
	const miss = readCount("Miss", input.miss);
	const noShoot = readCount("No Shoot", input.noShoot);
	const pe = readCount("Procedural Penalty", input.pe);
	const time = Number(input.time.trim());
	if (!input.time.trim() || !Number.isFinite(time) || time <= 0) {
		throw new Error("Time must be a number greater than zero.");
	}

	const points = a * 5 + c * 3 + d - (miss + noShoot + pe) * 10;
	const factor = points / time;
	const stageRecords = groupResults.flatMap((player) =>
		player.stageResult.filter((record) => record.stage === stage),
	);
	const maxFactor = Math.max(
		0,
		factor,
		...stageRecords.map((record) => Number(record.factor) || 0),
	);
	const maxPoint =
		Math.max(
			a + c + d + miss,
			...stageRecords.map(
				(record) =>
					(Number(record.a) || 0) +
					(Number(record.c) || 0) +
					(Number(record.d) || 0) +
					(Number(record.mi) || 0),
			),
		) * 5;
	const stagePoint =
		maxFactor > 0 && Number.isFinite(factor)
			? (factor / maxFactor) * maxPoint
			: 0;

	return {
		name: shooterName,
		stage,
		factor: factor.toFixed(4),
		pts: String(points),
		a: String(a),
		c: String(c),
		d: String(d),
		mi: String(miss),
		ns: String(noShoot),
		pe: String(pe),
		time: String(time),
		stagePoint,
	};
};

const rankGroup = (groupResults: ShooterScore[]): ShooterScore[] => {
	const rankedPlayers = groupResults
		.map((player) => ({
			...player,
			totalStagePoint: player.stageResult.reduce(
				(total, stage) => total + stage.stagePoint,
				0,
			),
		}))
		.sort((left, right) => {
			if (left.dq !== right.dq) {
				return left.dq ? 1 : -1;
			}
			return right.totalStagePoint - left.totalStagePoint;
		});
	const highestScore = rankedPlayers[0]?.totalStagePoint ?? 1;

	return rankedPlayers.map((player, index) => ({
		...player,
		rank: index + 1,
		percent: (player.totalStagePoint / highestScore) * 100,
	}));
};

type StoredFakeRecord = {
	groupName: string;
	shooter_id: number;
	name: string;
	div: string;
	class_name: string;
	cat: string | null;
	stageResult: StageResult;
};

const isStoredFakeRecord = (value: unknown): value is StoredFakeRecord => {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Partial<StoredFakeRecord>;
	const stage = record.stageResult;
	return (
		typeof record.groupName === "string" &&
		Number.isSafeInteger(record.shooter_id) &&
		typeof record.name === "string" &&
		typeof record.div === "string" &&
		typeof record.class_name === "string" &&
		(record.cat === null || typeof record.cat === "string") &&
		!!stage &&
		typeof stage === "object" &&
		Number.isSafeInteger(stage.stage) &&
		typeof stage.factor === "string" &&
		typeof stage.pts === "string" &&
		typeof stage.a === "string" &&
		typeof stage.c === "string" &&
		typeof stage.d === "string" &&
		typeof stage.mi === "string" &&
		typeof stage.ns === "string" &&
		typeof stage.pe === "string" &&
		typeof stage.time === "string" &&
		Number.isFinite(stage.stagePoint)
	);
};

const readStoredFakeRecords = async (
	storageKey: string,
): Promise<StoredFakeRecord[]> => {
	const stored = await AsyncStorage.getItem(storageKey);
	if (stored === null) {
		return [];
	}
	const parsed: unknown = JSON.parse(stored);
	if (!Array.isArray(parsed) || !parsed.every(isStoredFakeRecord)) {
		throw new Error("Saved fake score data is invalid.");
	}
	return parsed;
};

const writeStoredFakeRecords = async (
	storageKey: string,
	records: StoredFakeRecord[],
) => {
	if (records.length === 0) {
		await AsyncStorage.removeItem(storageKey);
		return;
	}
	await AsyncStorage.setItem(storageKey, JSON.stringify(records));
};

const mergeFakeRecords = (
	scoreGroups: ScoreGroup[],
	records: StoredFakeRecord[],
): ScoreGroup[] =>
	scoreGroups.map((group) => {
		const groupRecords = records.filter(
			(record) => record.groupName === group.groupName,
		);
		if (!groupRecords.length) {
			return group;
		}

		let groupResults = [...group.groupResults];
		for (const record of groupRecords) {
			const playerIndex = groupResults.findIndex(
				(player) => player.shooter_id === record.shooter_id,
			);
			if (playerIndex >= 0) {
				const player = groupResults[playerIndex];
				groupResults[playerIndex] = {
					...player,
					stageResult: [
						...player.stageResult,
						{ ...record.stageResult, name: player.name },
					],
				};
			} else {
				groupResults.push({
					shooter_id: record.shooter_id,
					name: record.name,
					div: record.div,
					class_name: record.class_name,
					cat: record.cat,
					totalStagePoint: record.stageResult.stagePoint,
					dq: false,
					rank: 0,
					percent: 0,
					stageResult: [record.stageResult],
				});
			}
		}
		return { ...group, groupResults: rankGroup(groupResults) };
	});

export default function LeaderboardScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{
		matchId?: string;
		baseUrl?: string;
		matchName?: string;
		href?: string;
	}>();

	const matchId = params.matchId ?? "";
	const baseUrl = normalizeBaseUrl(params.baseUrl ?? getDefaultBaseUrl());
	const matchName = params.matchName ?? "Selected match";
	const href = params.href ?? "";
	const fakeRecordsStorageKey = useMemo(
		() =>
			`ipsc-score:fake-records:${encodeURIComponent(baseUrl)}:${encodeURIComponent(String(matchId))}:${encodeURIComponent(href)}`,
		[baseUrl, matchId, href],
	);

	const [scoreGroups, setScoreGroups] = useState<ScoreGroup[]>([]);
	const [scoreLoading, setScoreLoading] = useState(false);
	const [scoreError, setScoreError] = useState<string | null>(null);
	const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
		null,
	);
	const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
	const [appendModalVisible, setAppendModalVisible] = useState(false);
	const [shooterIdInput, setShooterIdInput] = useState("");
	const [stageRecordInput, setStageRecordInput] =
		useState<FakeRecordInput>(emptyFakeRecord);
	const [appendError, setAppendError] = useState<string | null>(null);
	const [savingFakeRecord, setSavingFakeRecord] = useState(false);

	const loadScore = useCallback(async () => {
		if (!/^\d+$/.test(matchId) && !/^[0-9a-f-]{36}$/i.test(matchId)) {
			setScoreError("Invalid match id.");
			setScoreGroups([]);
			return;
		}

		setScoreLoading(true);
		setScoreError(null);

		try {
			const data = await fetchScore(baseUrl, matchId, href);
			setScoreGroups(data);
			try {
				const savedRecords =
					await readStoredFakeRecords(fakeRecordsStorageKey);
				const realRecords = new Set(
					data.flatMap((group) =>
						group.groupResults.flatMap((player) =>
							player.stageResult.map(
								(stage) => `${player.shooter_id}:${stage.stage}`,
							),
						),
					),
				);
				const pendingRecords = savedRecords.filter(
					(record) =>
						!realRecords.has(
							`${record.shooter_id}:${record.stageResult.stage}`,
						),
				);
				if (pendingRecords.length !== savedRecords.length) {
					await writeStoredFakeRecords(
						fakeRecordsStorageKey,
						pendingRecords,
					);
				}
				setScoreGroups(mergeFakeRecords(data, pendingRecords));
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load saved fake records.";
				setScoreError(`Could not load local fake records: ${message}`);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load score";
			setScoreError(message);
			setScoreGroups([]);
		} finally {
			setScoreLoading(false);
		}
	}, [baseUrl, matchId, href, fakeRecordsStorageKey]);

	useFocusEffect(
		useCallback(() => {
			void loadScore();
		}, [loadScore]),
	);

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

	const shooterIdPreview = useMemo(() => {
		const shooterId = Number(shooterIdInput.trim());
		if (!Number.isSafeInteger(shooterId) || shooterId < 1) {
			return null;
		}

		const shooter = scoreGroups
			.find((group) => group.groupName === selectedGroupName)
			?.groupResults.find((player) => player.shooter_id === shooterId)
			?? scoreGroups
				.flatMap((group) => group.groupResults)
				.find((player) => player.shooter_id === shooterId);

		return shooter?.name ?? `Fake shooter ${shooterId}`;
	}, [scoreGroups, selectedGroupName, shooterIdInput]);

	const appendFakeRecord = async () => {
		const shooterId = Number(shooterIdInput.trim());
		if (!Number.isSafeInteger(shooterId) || shooterId < 1) {
			setAppendError("Enter a positive integer shooter ID.");
			return;
		}

		if (!selectedGroupName) {
			setAppendError("Select a group before adding a fake record.");
			return;
		}

		const matchingPlayers = scoreGroups.flatMap((group) =>
			group.groupResults.filter((player) => player.shooter_id === shooterId),
		);
		const shooterName =
			matchingPlayers[0]?.name ?? `Fake shooter ${shooterId}`;

		const stageValue = Number(stageRecordInput.stage.trim());
		if (!Number.isSafeInteger(stageValue) || stageValue < 1) {
			setAppendError("Stage must be a positive whole number.");
			return;
		}
		if (
			matchingPlayers.some((player) =>
				player.stageResult.some((stage) => stage.stage === stageValue),
			)
		) {
			setAppendError(
				`Shooter ${shooterId} already has a record for stage ${stageValue}.`,
			);
			return;
		}

		let stageRecordsByGroup: Map<string, StageResult>;
		try {
			stageRecordsByGroup = new Map<string, StageResult>(
				scoreGroups.map((group) => [
					group.groupName,
					createStageRecord(stageRecordInput, shooterName, group.groupResults),
				] as const),
			);
		} catch (error) {
			setAppendError(
				error instanceof Error ? error.message : "Invalid stage record.",
			);
			return;
		}

		const recordsToSave = scoreGroups.flatMap((group) => {
			const stageResult = stageRecordsByGroup.get(group.groupName);
			const player = group.groupResults.find(
				(item) => item.shooter_id === shooterId,
			);
			if (!stageResult || (!player && group.groupName !== selectedGroupName)) {
				return [];
			}
			return [
				{
					groupName: group.groupName,
					shooter_id: shooterId,
					name: player?.name ?? shooterName,
					div: player?.div ?? "Unknown",
					class_name: player?.class_name ?? "Unknown",
					cat: player?.cat ?? null,
					stageResult: { ...stageResult, isFake: true },
				},
			];
		});

		setSavingFakeRecord(true);
		setAppendError(null);
		try {
			const savedRecords =
				await readStoredFakeRecords(fakeRecordsStorageKey);
			const nextStoredRecords = [
				...savedRecords.filter(
					(record) =>
						!(
							record.shooter_id === shooterId &&
							record.stageResult.stage === stageValue
						),
				),
				...recordsToSave,
			];
			await writeStoredFakeRecords(
				fakeRecordsStorageKey,
				nextStoredRecords,
			);
			setScoreGroups(
				scoreGroups.map((group) => {
					const stageRecord = stageRecordsByGroup.get(group.groupName);
					if (!stageRecord) {
						return group;
					}
					const hasShooter = group.groupResults.some(
						(player) => player.shooter_id === shooterId,
					);
					if (!hasShooter && group.groupName !== selectedGroupName) {
						return group;
					}

					const groupResults = hasShooter
						? group.groupResults.map((player) =>
								player.shooter_id === shooterId
									? {
											...player,
											stageResult: [
												...player.stageResult,
												{ ...stageRecord, isFake: true },
											],
										}
									: player,
							)
						: [
								...group.groupResults,
								{
									shooter_id: shooterId,
									name: shooterName,
									div: "Unknown",
									class_name: "Unknown",
									cat: null,
									totalStagePoint: stageRecord.stagePoint,
									dq: false,
									rank: 0,
									percent: 0,
									stageResult: [stageRecord],
								},
							];
					return { ...group, groupResults: rankGroup(groupResults) };
				}),
			);
			setAppendModalVisible(false);
			setShooterIdInput("");
			setStageRecordInput(emptyFakeRecord);
		} catch (error) {
			setAppendError(
				error instanceof Error
					? `Could not save fake record: ${error.message}`
					: "Could not save fake record.",
			);
		} finally {
			setSavingFakeRecord(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.headerCard}>
				<Text style={styles.title}>{matchName}</Text>
				<Text style={styles.helpText}>Match #{matchId}</Text>
				<View style={styles.headerActions}>
					<Pressable
						onPress={() => {
							setAppendError(null);
							setAppendModalVisible(true);
						}}
						style={[styles.secondaryButton, styles.appendButton]}
					>
						<Text style={styles.secondaryButtonText}>Append Fake Record</Text>
					</Pressable>
					<Pressable
						onPress={() => void loadScore()}
						style={[styles.secondaryButton, styles.refreshButton]}
					>
						<Text style={styles.secondaryButtonText}>Refresh Score</Text>
					</Pressable>
				</View>
			</View>

			<Modal
				animationType="fade"
				transparent
				visible={appendModalVisible}
				onRequestClose={() => setAppendModalVisible(false)}
			>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>Append Fake Record</Text>
						<Text style={styles.modalHelpText}>
							This record is only added to the score on this device. Points use
							minor scoring (A = 5, C = 3, D = 1; each penalty = -10).
						</Text>
						<ScrollView
							style={styles.modalForm}
							contentContainerStyle={styles.modalFormContent}
							keyboardShouldPersistTaps="handled"
						>
							<View
								style={[styles.formField, styles.fullWidthField]}
							>
								<Text style={styles.inputLabel}>Shooter ID</Text>
								<TextInput
									value={shooterIdInput}
									onChangeText={setShooterIdInput}
									style={styles.textInput}
									keyboardType="number-pad"
									placeholder="e.g. 12345"
									placeholderTextColor="#7b8ba3"
								/>
								{shooterIdPreview ? (
									<Text style={styles.shooterPreview}>
										Shooter: {shooterIdPreview}
									</Text>
								) : null}
							</View>
							{fakeRecordFields.map((field) => (
								<View key={field.key} style={styles.formField}>
									<Text style={styles.inputLabel}>{field.label}</Text>
									<TextInput
										value={stageRecordInput[field.key]}
										onChangeText={(value) =>
											setStageRecordInput((previous) => ({
												...previous,
												[field.key]: value,
											}))
										}
										style={styles.textInput}
										keyboardType={field.decimal ? "decimal-pad" : "number-pad"}
										placeholder={field.decimal ? "0.00" : "0"}
										placeholderTextColor="#7b8ba3"
									/>
								</View>
							))}
						</ScrollView>
						{appendError ? (
							<Text style={styles.errorText}>{appendError}</Text>
						) : null}
						<View style={styles.modalActions}>
							<Pressable
								onPress={() => setAppendModalVisible(false)}
								style={[styles.modalButton, styles.cancelButton]}
							>
								<Text style={styles.cancelButtonText}>Cancel</Text>
							</Pressable>
							<Pressable
								onPress={() => void appendFakeRecord()}
								disabled={savingFakeRecord}
								style={[
									styles.modalButton,
									styles.confirmButton,
									savingFakeRecord && styles.disabledButton,
								]}
							>
								<Text style={styles.confirmButtonText}>
									{savingFakeRecord ? "Saving..." : "Append"}
								</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>

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
		backgroundColor: "#245fb7",
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 8,
		alignItems: "center",
	},
	headerActions: {
		marginTop: 4,
		flexDirection: "row",
		gap: 8,
	},
	appendButton: {
		flex: 1,
		backgroundColor: "#52647e",
	},
	refreshButton: {
		flex: 1,
	},
	secondaryButtonText: {
		color: "#ffffff",
		fontWeight: "600",
		fontSize: 13,
		textAlign: "center",
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(12, 24, 42, 0.55)",
		justifyContent: "center",
		padding: 20,
	},
	modalCard: {
		backgroundColor: "#ffffff",
		borderRadius: 14,
		padding: 18,
		gap: 8,
		maxHeight: "90%",
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#16243b",
	},
	modalHelpText: {
		color: "#465771",
		fontSize: 13,
		lineHeight: 18,
		marginBottom: 4,
	},
	modalForm: {
		flexGrow: 0,
		maxHeight: 420,
	},
	modalFormContent: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		gap: 10,
		paddingVertical: 4,
	},
	formField: {
		width: "48%",
		gap: 4,
	},
	fullWidthField: {
		width: "100%",
	},
	inputLabel: {
		fontSize: 13,
		fontWeight: "600",
		color: "#1d2f4c",
	},
	shooterPreview: {
		color: "#245fb7",
		fontSize: 13,
		fontWeight: "600",
	},
	textInput: {
		borderWidth: 1,
		borderColor: "#c7d5eb",
		borderRadius: 8,
		backgroundColor: "#f7f9fe",
		color: "#1d2f4c",
		paddingHorizontal: 10,
		paddingVertical: 10,
		fontSize: 14,
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		gap: 8,
		marginTop: 8,
	},
	modalButton: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
		alignItems: "center",
	},
	cancelButton: {
		backgroundColor: "#edf2fb",
	},
	cancelButtonText: {
		color: "#1d2f4c",
		fontWeight: "600",
	},
	confirmButton: {
		backgroundColor: "#245fb7",
	},
	disabledButton: {
		opacity: 0.6,
	},
	confirmButtonText: {
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
