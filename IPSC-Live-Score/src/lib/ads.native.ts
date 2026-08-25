import mobileAds, {
  AdsConsent,
} from "react-native-google-mobile-ads";


export const disableAds = true;

let initialization: Promise<void> | null = null;


export function initializeAds() {
  if (!initialization && !disableAds) {
    initialization = (async () => {
      const consentInfo = await AdsConsent.gatherConsent();
      if (!consentInfo.canRequestAds) {
        return;
      }

      await mobileAds().initialize();
    })().catch((error) => {
      initialization = null;
      console.warn("Google Mobile Ads initialization failed.", error);
    });
  }

  return initialization;
}
