import {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  TestIds,
} from "react-native-google-mobile-ads";
import mobileAds from "react-native-google-mobile-ads";

export const bannerAdUnitId = TestIds.ADAPTIVE_BANNER;

const interstitialAdUnitId = TestIds.INTERSTITIAL;
const leaderboardOpenInterval = 3;
const interstitialCooldownMs = 120_000;
const interstitialRetryDelayMs = 30_000;

let initialization: Promise<void> | null = null;
let interstitial: InterstitialAd | null = null;
let leaderboardOpenCount = 0;
let lastInterstitialShownAt = 0;
let interstitialRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInterstitialPreload() {
  if (interstitialRetryTimer) {
    return;
  }

  interstitialRetryTimer = setTimeout(() => {
    interstitialRetryTimer = null;
    preloadInterstitial();
  }, interstitialRetryDelayMs);
}

function preloadInterstitial() {
  if (interstitial) {
    return;
  }

  const nextInterstitial = InterstitialAd.createForAdRequest(interstitialAdUnitId);
  interstitial = nextInterstitial;

  nextInterstitial.addAdEventListener(AdEventType.ERROR, () => {
    if (interstitial === nextInterstitial) {
      interstitial = null;
      scheduleInterstitialPreload();
    }
  });
  nextInterstitial.addAdEventListener(AdEventType.CLOSED, () => {
    if (interstitial === nextInterstitial) {
      interstitial = null;
      preloadInterstitial();
    }
  });
  nextInterstitial.load();
}

export function initializeAds() {
  if (!initialization) {
    initialization = (async () => {
      const consentInfo = await AdsConsent.gatherConsent();
      if (!consentInfo.canRequestAds) {
        return;
      }

      await mobileAds().initialize();
      preloadInterstitial();
    })().catch((error) => {
      initialization = null;
      console.warn("Google Mobile Ads initialization failed.", error);
    });
  }

  return initialization;
}

export function showLeaderboardInterstitial(onComplete: () => void) {
  leaderboardOpenCount += 1;

  const now = Date.now();
  const isEligible =
    leaderboardOpenCount > 1 &&
    leaderboardOpenCount % leaderboardOpenInterval === 0 &&
    now - lastInterstitialShownAt >= interstitialCooldownMs;

  if (!isEligible || !interstitial?.loaded) {
    onComplete();
    return;
  }

  const adToShow = interstitial;
  interstitial = null;
  lastInterstitialShownAt = now;

  let completed = false;
  const complete = () => {
    if (completed) {
      return;
    }

    completed = true;
    preloadInterstitial();
    onComplete();
  };

  adToShow.addAdEventListener(AdEventType.CLOSED, complete);
  adToShow.addAdEventListener(AdEventType.ERROR, complete);
  void adToShow.show().catch(complete);
}