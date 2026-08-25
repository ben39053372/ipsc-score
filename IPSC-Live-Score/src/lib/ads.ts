import { Platform } from "react-native";

export const bannerAdUnitId = "";

export function initializeAds() {
  return Promise.resolve();
}

export function showLeaderboardInterstitial(onComplete: () => void) {
  onComplete();
}

export const AdsIDs = {
  APP_OPEN: Platform.select({
    ios: "ca-app-pub-5696990066265107/9809052699",
    android: "ca-app-pub-5696990066265107/4266343753",
  }) || "",
  MATCHES_BANNER: Platform.select({
    ios: "ca-app-pub-5696990066265107/9554786300",
    android: "ca-app-pub-5696990066265107/3236789961",
  }) || "",
  LEADERBOARD_BANNER: Platform.select({
    ios: "ca-app-pub-5696990066265107/9554786300",
    android: "ca-app-pub-5696990066265107/7105928386",
  }) || "",
  PLAYER_DETAIL_BANNER: Platform.select({
    ios: "ca-app-pub-5696990066265107/8241704631",
    android: "ca-app-pub-5696990066265107/6636094448",
  }) || "",
};