import { Stack } from "expo-router";
import { useEffect } from "react";
import { initializeAds } from "../lib/ads";

export default function RootLayout() {
  useEffect(() => {
    void initializeAds();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Matches" }} />
      <Stack.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
      <Stack.Screen name="player-detail" options={{ title: "Player Detail" }} />
    </Stack>
  );
}
