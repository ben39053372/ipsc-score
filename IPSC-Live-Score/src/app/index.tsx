import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useAppOpenAd } from "react-native-google-mobile-ads";
import { AdsIDs } from "@/lib/adids";
import { disableAds } from "@/lib/ads.native";
import { AdBanner } from "../components/AdBanner";
import {
	fetchMatches,
	getDefaultBaseUrl,
	type MatchListItem,
} from "../lib/ipscApi";

export default function Index() {
	const router = useRouter();
	const { isLoaded, load, show } = useAppOpenAd(
		Platform.OS === "ios" ? AdsIDs.APP_OPEN.ios : AdsIDs.APP_OPEN.android,
	);
	const baseUrl = getDefaultBaseUrl();

	const [matches, setMatches] = useState<MatchListItem[]>([]);
	const [matchesLoading, setMatchesLoading] = useState(false);
	const [matchesError, setMatchesError] = useState<string | null>(null);

	const loadMatches = useCallback(async (targetBaseUrl: string) => {
		setMatchesLoading(true);
		setMatchesError(null);

		try {
			const data = await fetchMatches(targetBaseUrl);
			setMatches(data);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load matches";
			setMatchesError(message);
			setMatches([]);
		} finally {
			setMatchesLoading(false);
		}
	}, []);

	useEffect(() => {
		// Start loading the interstitial straight away
		if (!disableAds) {
			load();
		}
	}, [load]);

	useEffect(() => {
		if (isLoaded) {
			show();
		}
	}, [isLoaded, show]);

	useEffect(() => {
		void loadMatches(baseUrl);
	}, [baseUrl, loadMatches]);

	const openLeaderboard = useCallback(
		(match: MatchListItem) => {
			router.push({
				pathname: "/leaderboard",
				params: {
					matchId: String(match.matchId),
					baseUrl,
					matchName: match.name,
					href: match.href,
				},
			});
		},
		[router, baseUrl],
	);

	return (
		<View style={styles.container}>
			<View style={styles.matchesCard}>
				<Text style={styles.title}>IPSC Live Score</Text>
				<Text style={styles.sectionTitle}>Matches</Text>
				{matchesLoading ? <ActivityIndicator /> : null}
				{matchesError ? <Text style={styles.errorText}>No Data</Text> : null}
				{!matchesLoading && !matches.length && !matchesError ? (
					<Text style={styles.helpText}>No matches found yet.</Text>
				) : null}
				<FlatList
					data={matches}
					keyExtractor={(item) => item.matchId.toString() + item.href}
					contentContainerStyle={styles.matchListContent}
					renderItem={({ item }) => {
						return (
							<Pressable
								onPress={() => openLeaderboard(item)}
								style={styles.matchItem}
							>
								<Text style={styles.matchName} numberOfLines={2}>
									{item.name}
								</Text>
								<Text style={styles.matchMeta}>ID {item.matchId}</Text>
								<Text style={styles.matchMeta}>{item.date}</Text>
								<Text style={styles.matchMeta} numberOfLines={1}>
									{item.club}
								</Text>
								<Text style={styles.matchMeta}>{item.level}</Text>
							</Pressable>
						);
					}}
				/>
			</View>
			<AdBanner
				adUnitId={
					Platform.OS === "ios"
						? AdsIDs.MATCHES_BANNER.ios
						: AdsIDs.MATCHES_BANNER.android
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
		alignItems: "center",
		gap: 12,
	},
	matchesCard: {
		flex: 1,
		backgroundColor: "#ffffff",
		borderRadius: 14,
		padding: 12,
		borderColor: "#d2ddf0",
		borderWidth: 1,
	},
	title: {
		fontSize: 24,
		fontWeight: "700",
		color: "#16243b",
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#16243b",
		marginBottom: 8,
	},
	helpText: {
		color: "#465771",
		fontSize: 13,
	},
	errorText: {
		color: "#b32323",
		marginBottom: 6,
	},
	matchListContent: {
		gap: 10,
		paddingVertical: 4,
		paddingBottom: 16,
	},
	matchItem: {
		borderRadius: 10,
		borderWidth: 1,
		borderColor: "#d5dfef",
		padding: 10,
		backgroundColor: "#f8faff",
		gap: 2,
	},
	matchName: {
		color: "#1b2c48",
		fontWeight: "700",
		fontSize: 14,
	},
	matchMeta: {
		color: "#4e617e",
		fontSize: 12,
	},
	openLabel: {
		marginTop: 6,
		color: "#245fb7",
		fontSize: 12,
		fontWeight: "700",
	},
});
