// imports (single React import)
import React, { useEffect, ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, StyleSheet } from "react-native";
import { RecordingProvider } from "@/hooks/recording-store";
import { AuthProvider } from "@/hooks/auth-store";
import { trpc, trpcClient } from "@/lib/trpc";

const styles = StyleSheet.create({
  hydrationContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  hydrationText: { fontSize: 16, color: "#FF8C00", fontWeight: "bold" },
  gestureHandler: { flex: 1 },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5 * 60 * 1000 } },
});

function HydrationWrapper({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsHydrated(true), 10);
    return () => clearTimeout(timer);
  }, []);
  if (!isHydrated) {
    return (
      <View style={styles.hydrationContainer}>
        <Text style={styles.hydrationText}>Loading...</Text>
      </View>
    );
  }
  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="signin" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="meeting/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    console.log("RootLayout mounted - App is starting");
  }, []);

  return (
    <HydrationWrapper>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RecordingProvider>
              <GestureHandlerRootView style={styles.gestureHandler}>
                <RootLayoutNav />
              </GestureHandlerRootView>
            </RecordingProvider>
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </HydrationWrapper>
  );
}