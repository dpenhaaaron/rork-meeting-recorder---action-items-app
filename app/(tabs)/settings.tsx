import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Shield, 
  Trash2, 
  Download, 
  Bell, 
  Mic, 
  Globe, 
  HelpCircle,
  ChevronRight,
  AlertTriangle,
  LogOut,
  User,
  Settings as SettingsIcon
} from 'lucide-react-native';

import { useRecording } from '@/hooks/recording-store';
import { useAuth } from '@/hooks/auth-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const { meetings, setConsentGiven, consentGiven } = useRecording();
  const { user, signOut } = useAuth();
  const [autoDelete, setAutoDelete] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [highQualityAudio, setHighQualityAudio] = useState(true);

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all recordings, transcripts, and meeting data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert('Success', 'All data has been cleared.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Export all your meeting data as JSON files. This feature will be available in a future update.',
      [{ text: 'OK' }]
    );
  };

  const handleResetConsent = () => {
    Alert.alert(
      'Reset Recording Consent',
      'This will require you to provide consent again before recording meetings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            setConsentGiven(false);
            Alert.alert('Success', 'Recording consent has been reset.');
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  const SettingSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const SettingRow = ({ 
    icon, 
    title, 
    subtitle, 
    onPress, 
    rightElement,
    danger = false 
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    danger?: boolean;
  }) => (
    <TouchableOpacity 
      style={styles.settingRow} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, danger && styles.dangerIcon]}>
          {icon}
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement || (onPress && <ChevronRight size={20} color="#9CA3AF" />)}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ 
          title: 'Settings', 
          headerShown: true,
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTitleStyle: {
            color: '#FF8C00',
            fontWeight: 'bold',
          },
        }} />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <SettingSection title="Account">
          <SettingRow
            icon={<User size={20} color="#FF8C00" />}
            title={user?.fullName || 'User'}
            subtitle={`${user?.email} • ${user?.location}`}
          />
          
          {user?.isAdmin && (
            <SettingRow
              icon={<SettingsIcon size={20} color="#FF8C00" />}
              title="Admin Dashboard"
              subtitle="Manage users and app settings"
              onPress={() => router.push('/admin')}
            />
          )}
          
          <SettingRow
            icon={<LogOut size={20} color="#EF4444" />}
            title="Sign Out"
            subtitle="Sign out of your account"
            onPress={handleSignOut}
            danger
          />
        </SettingSection>

        <SettingSection title="Privacy & Security">
          <SettingRow
            icon={<Shield size={20} color="#FF8C00" />}
            title="Recording Consent"
            subtitle={consentGiven ? "Consent provided" : "Consent required before recording"}
            onPress={handleResetConsent}
          />
          
          <SettingRow
            icon={<Trash2 size={20} color="#FF8C00" />}
            title="Auto-delete recordings"
            subtitle="Delete audio files after 14 days"
            rightElement={
              <Switch
                value={autoDelete}
                onValueChange={setAutoDelete}
                trackColor={{ false: '#E5E7EB', true: '#FF8C00' }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </SettingSection>

        <SettingSection title="Recording">
          <SettingRow
            icon={<Mic size={20} color="#FF8C00" />}
            title="High Quality Audio"
            subtitle="Better transcription accuracy, larger file size"
            rightElement={
              <Switch
                value={highQualityAudio}
                onValueChange={setHighQualityAudio}
                trackColor={{ false: '#E5E7EB', true: '#FF8C00' }}
                thumbColor="#FFFFFF"
              />
            }
          />
          
          <SettingRow
            icon={<Bell size={20} color="#FF8C00" />}
            title="Processing Notifications"
            subtitle="Get notified when transcripts are ready"
            rightElement={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#E5E7EB', true: '#FF8C00' }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </SettingSection>

        <SettingSection title="Data Management">
          <SettingRow
            icon={<Download size={20} color="#FF8C00" />}
            title="Export Data"
            subtitle="Download all your meeting data"
            onPress={handleExportData}
          />
        </SettingSection>

        <SettingSection title="Support">
          <SettingRow
            icon={<HelpCircle size={20} color="#FF8C00" />}
            title="Help & FAQ"
            subtitle="Get help with using the app"
            onPress={() => Alert.alert('Help', 'Help documentation coming soon!')}
          />
          
          <SettingRow
            icon={<Globe size={20} color="#FF8C00" />}
            title="Privacy Policy"
            subtitle="Learn how we protect your data"
            onPress={() => Alert.alert('Privacy Policy', 'Privacy policy coming soon!')}
          />
        </SettingSection>

        <SettingSection title="Danger Zone">
          <SettingRow
            icon={<AlertTriangle size={20} color="#EF4444" />}
            title="Clear All Data"
            subtitle="Permanently delete all recordings and data"
            onPress={handleClearAllData}
            danger
          />
        </SettingSection>

        <View style={styles.footer}>
          <Text style={styles.footerText}>CONVAI v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            {meetings.length} meetings • AI-powered transcription
          </Text>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 12,
    marginHorizontal: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dangerIcon: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  dangerText: {
    color: '#EF4444',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});