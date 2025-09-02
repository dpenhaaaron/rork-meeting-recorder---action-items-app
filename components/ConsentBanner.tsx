import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { AlertTriangle, Check, X } from 'lucide-react-native';

interface ConsentBannerProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function ConsentBanner({ visible, onAccept, onDecline }: ConsentBannerProps) {
  if (!visible) return null;

  const handleAccept = () => {
    Alert.alert(
      'Recording Consent',
      'By proceeding, you confirm that:\n\n• All participants are aware this meeting is being recorded\n• You have permission to record this conversation\n• You will handle the recording data responsibly\n\nThis recording will be processed to generate meeting notes and action items.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I Understand', onPress: onAccept },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.header}>
          <AlertTriangle size={20} color="#F59E0B" />
          <Text style={styles.title}>Recording Consent Required</Text>
        </View>
        
        <Text style={styles.message}>
          Ensure all participants consent to being recorded. This meeting will be transcribed and analyzed to generate action items and notes.
        </Text>
        
        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
            <X size={16} color="#EF4444" />
            <Text style={styles.declineText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Check size={16} color="#FFFFFF" />
            <Text style={styles.acceptText}>I Have Consent</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  banner: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  declineText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EF4444',
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    gap: 6,
  },
  acceptText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});