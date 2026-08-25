import { useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
	BannerAd,
	BannerAdSize,
	useForeground,
} from "react-native-google-mobile-ads";
import { disableAds } from "@/lib/ads.native";

export function AdBanner({ adUnitId }: { adUnitId: string }) {
	const bannerRef = useRef<BannerAd>(null);

	useForeground(() => {
		Platform.OS === "ios" && bannerRef.current?.load();
	});

	if (disableAds) {
		return null;
	}

	return (
		<View style={styles.container}>
			<BannerAd
				ref={bannerRef}
				unitId={adUnitId}
				size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		justifyContent: "center",
		minHeight: 50,
	},
});
