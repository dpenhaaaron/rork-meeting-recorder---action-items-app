import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { LiveSegment } from "@/hooks/use-live-transcription";

export function LiveASRTranscript({
  partial,
  segments,
  connected,
  error,
}: {
  partial: string;
  segments: LiveSegment[];
  connected: boolean;
  error?: string;
}) {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {segments.map(s => (
          <Text key={s.id} style={styles.finalText}>{s.text}</Text>
        ))}
        {partial ? <Text style={styles.partialText}>{partial}</Text> : null}
        {segments.length === 0 && !partial && connected && !error && (
          <Text style={styles.waitingText}>Listening for speech...</Text>
        )}
        {error && (
          <Text style={styles.errorText}>Error: {error}</Text>
        )}
      </ScrollView>
      <View style={[
        styles.pill, 
        error ? styles.pillError : (connected ? styles.pillConnected : styles.pillDisconnected)
      ]}>
        <View style={[
          styles.indicator, 
          error ? styles.indicatorError : (connected ? styles.indicatorActive : styles.indicatorInactive)
        ]} />
        <Text style={[
          styles.pillText, 
          error ? styles.pillTextError : (connected ? styles.pillTextActive : styles.pillTextInactive)
        ]}>
          {error ? "Error" : (connected ? (partial ? "Listening..." : "Live") : "Connecting...")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: "relative", 
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 200,
  },
  list: { 
    padding: 16,
    flex: 1,
  },
  finalText: { 
    fontSize: 16, 
    color: "#111827", 
    marginBottom: 8,
    lineHeight: 24,
  },
  partialText: { 
    fontSize: 16, 
    color: "#6B7280", 
    fontStyle: "italic",
    lineHeight: 24,
  },
  waitingText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
  },
  pill: {
    position: "absolute",
    right: 12,
    bottom: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pillConnected: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  pillDisconnected: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pillError: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  indicatorActive: {
    backgroundColor: "#10B981",
  },
  indicatorInactive: {
    backgroundColor: "#F59E0B",
  },
  indicatorError: {
    backgroundColor: "#EF4444",
  },
  pillText: { 
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#065F46",
  },
  pillTextInactive: {
    color: "#92400E",
  },
  pillTextError: {
    color: "#991B1B",
  },
});