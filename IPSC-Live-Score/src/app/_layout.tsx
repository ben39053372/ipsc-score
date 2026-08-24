import { Stack } from "expo-router";
import mobileAds from 'react-native-google-mobile-ads';

export default function RootLayout() {
  
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Matches" }} />
      <Stack.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
      <Stack.Screen name="player-detail" options={{ title: "Player Detail" }} />
    </Stack>
  );
}
