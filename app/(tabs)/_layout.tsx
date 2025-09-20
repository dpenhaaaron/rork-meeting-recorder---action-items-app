import React, { useEffect, useState } from "react";
import { Tabs, router } from "expo-router";
import { Mic, FileText, Settings } from "lucide-react-native";
import { useAuth } from "@/hooks/auth-store";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, color: "#6B7280" },
});

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!isMounted) return;
    if (!isLoading && !isAuthenticated) {
      router.replace("/signin");
    }
  }, [isMounted, isLoading, isAuthenticated]);

  if (!isMounted || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#9CA3AF",
        headerShown: false,
        tabBarStyle: { backgroundColor: "#FFFFFF", borderTopColor: "#E5E7EB", paddingTop: 8, paddingBottom: 8, height: 60 },
      }}
    >
      {/* your Tabs.Screen definitions */}
    </Tabs>
  );
}