import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share, ActivityIndicator, Platform } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Share2, Download, Mail, Trash2, RefreshCw, FileText, Languages } from 'lucide-react-native';
import { useRecording } from '@/hooks/recording-store';
import MeetingInsights from '@/components/MeetingInsights';
import MeetingTranslation from '@/components/MeetingTranslation';
import { Meeting } from '@/types/meeting';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { meetings, processMeeting, deleteMeeting, processingProgress } = useRecording();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activeView, setActiveView] = useState<'insights' | 'translation'>('insights');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const foundMeeting = meetings.find(m => m.id === id);
    if (foundMeeting) {
      setMeeting(foundMeeting);
      
      // Auto-process if needed
      if (foundMeeting.status === 'processing') {
        // Auto-process will be handled by the processing system
      }
    }
  }, [id, meetings, isProcessing]);

  const handleProcess = async () => {
    if (!meeting || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await processMeeting(meeting.id);
      Alert.alert('Success', 'Meeting processed successfully!');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to process meeting');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    if (!meeting) return;

    try {
      const content = generateShareContent();
      await Share.share({
        message: content,
        title: `Meeting Notes: ${meeting.title}`,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share meeting notes');
    }
  };

  const handleExport = async () => {
    if (!meeting || !meeting.artifacts) return;

    try {
      const content = generateExportContent();
      const fileName = `${meeting.title.replace(/[^a-z0-9]/gi, '_')}_notes.txt`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, content);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath);
      } else {
        Alert.alert('Success', `Notes saved to ${fileName}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export meeting notes');
    }
  };

  const handleEmailDraft = () => {
    if (!meeting?.artifacts) return;
    
    const emailContent = generateEnhancedEmailDraft();
    
    Alert.alert(
      'Email Draft',
      'Choose how to share the meeting summary:',
      [
        { text: 'Email App', onPress: () => openEmailApp(emailContent) },
        { text: 'Copy Content', onPress: () => copyToClipboard(emailContent.body) },
        { text: 'Share Options', onPress: () => showShareOptions(emailContent) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const generateEnhancedEmailDraft = () => {
    if (!meeting?.artifacts) return { subject: '', body: '' };
    
    const subject = `Meeting Summary: ${meeting.title} - ${new Date(meeting.date).toLocaleDateString()}`;
    
    let body = `Hi team,\n\nHere's a summary of our meeting "${meeting.title}" from ${new Date(meeting.date).toLocaleDateString()}:\n\n`;
    
    // Executive Summary
    if (meeting.artifacts.summaries?.executive_120w) {
      body += `📋 **EXECUTIVE SUMMARY**\n${meeting.artifacts.summaries.executive_120w}\n\n`;
    }
    
    // Key Points
    if (meeting.artifacts.summaries?.bullet_12 && meeting.artifacts.summaries.bullet_12.length > 0) {
      body += `🔑 **KEY POINTS**\n`;
      meeting.artifacts.summaries.bullet_12.forEach(point => {
        body += `• ${point}\n`;
      });
      body += '\n';
    }
    
    // Action Items
    if (meeting.artifacts.action_items.length > 0) {
      body += `✅ **ACTION ITEMS**\n`;
      meeting.artifacts.action_items.forEach(item => {
        body += `• ${item.title}\n`;
        body += `  - Assigned to: ${item.assignee}\n`;
        body += `  - Priority: ${item.priority}\n`;
        if (item.due_date) body += `  - Due: ${new Date(item.due_date).toLocaleDateString()}\n`;
        body += '\n';
      });
    }
    
    // Decisions
    if (meeting.artifacts.decisions.length > 0) {
      body += `🎯 **DECISIONS MADE**\n`;
      meeting.artifacts.decisions.forEach(decision => {
        body += `• ${decision.statement}\n`;
        if (decision.rationale) body += `  - Rationale: ${decision.rationale}\n`;
        body += '\n';
      });
    }
    
    // Open Questions
    if (meeting.artifacts.open_questions.length > 0) {
      body += `❓ **OPEN QUESTIONS**\n`;
      meeting.artifacts.open_questions.forEach(question => {
        body += `• ${question.question}\n`;
        if (question.owner) body += `  - Owner: ${question.owner}\n`;
        if (question.needed_by) body += `  - Needed by: ${question.needed_by}\n`;
        body += '\n';
      });
    }
    
    body += `Meeting Duration: ${formatDuration(meeting.duration)}\n`;
    body += `Attendees: ${meeting.attendees.map(a => a.name).join(', ')}\n\n`;
    body += 'Best regards';
    
    return { subject, body };
  };

  const openEmailApp = async (emailContent: { subject: string; body: string }) => {
    try {
      const emailUrl = `mailto:?subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(emailContent.body)}`;
      const canOpen = await Linking.canOpenURL(emailUrl);
      
      if (canOpen) {
        await Linking.openURL(emailUrl);
      } else {
        Alert.alert('Error', 'No email app found. Content copied to clipboard.');
        await copyToClipboard(emailContent.body);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open email app');
    }
  };

  const showShareOptions = async (emailContent: { subject: string; body: string }) => {
    const shareContent = `${emailContent.subject}\n\n${emailContent.body}`;
    
    Alert.alert(
      'Share Meeting Summary',
      'Choose your preferred messaging app:',
      [
        { text: 'WhatsApp', onPress: () => shareToWhatsApp(shareContent) },
        { text: 'Messages (SMS)', onPress: () => shareToMessages(shareContent) },
        { text: 'Telegram', onPress: () => shareToTelegram(shareContent) },
        { text: 'Slack', onPress: () => shareToSlack(shareContent) },
        { text: 'More Options', onPress: () => shareToGeneric(shareContent) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const shareToWhatsApp = async (content: string) => {
    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(content)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('WhatsApp not found', 'WhatsApp is not installed on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open WhatsApp');
    }
  };

  const shareToMessages = async (content: string) => {
    try {
      const smsUrl = Platform.OS === 'ios' 
        ? `sms:&body=${encodeURIComponent(content)}`
        : `sms:?body=${encodeURIComponent(content)}`;
      
      const canOpen = await Linking.canOpenURL(smsUrl);
      
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('Messages not available', 'SMS messaging is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open Messages');
    }
  };

  const shareToTelegram = async (content: string) => {
    try {
      const telegramUrl = `tg://msg?text=${encodeURIComponent(content)}`;
      const canOpen = await Linking.canOpenURL(telegramUrl);
      
      if (canOpen) {
        await Linking.openURL(telegramUrl);
      } else {
        Alert.alert('Telegram not found', 'Telegram is not installed on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open Telegram');
    }
  };

  const shareToSlack = async (content: string) => {
    try {
      const slackUrl = `slack://open?text=${encodeURIComponent(content)}`;
      const canOpen = await Linking.canOpenURL(slackUrl);
      
      if (canOpen) {
        await Linking.openURL(slackUrl);
      } else {
        Alert.alert('Slack not found', 'Slack is not installed on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open Slack');
    }
  };

  const shareToGeneric = async (content: string) => {
    try {
      await Share.share({
        message: content,
        title: `Meeting Summary: ${meeting?.title}`,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share content');
    }
  };

  const handleDelete = () => {
    if (!meeting) return;

    Alert.alert(
      'Delete Meeting',
      `Are you sure you want to delete "${meeting.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMeeting(meeting.id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete meeting');
            }
          }
        }
      ]
    );
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        // For native platforms, we'll use the Share API as a fallback
        await Share.share({ message: text });
        return;
      }
      Alert.alert('Copied', 'Content copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const generateShareContent = (): string => {
    if (!meeting) return '';
    
    let content = `📅 Meeting: ${meeting.title}\n`;
    content += `📆 Date: ${new Date(meeting.date).toLocaleString()}\n`;
    content += `⏱️ Duration: ${formatDuration(meeting.duration)}\n\n`;
    
    if (meeting.artifacts) {
      // Executive Summary
      if (meeting.artifacts.summaries?.executive_120w) {
        content += `📋 SUMMARY:\n${meeting.artifacts.summaries.executive_120w}\n\n`;
      }
      
      // Key Points
      if (meeting.artifacts.summaries?.bullet_12 && meeting.artifacts.summaries.bullet_12.length > 0) {
        content += `🔑 KEY POINTS:\n`;
        meeting.artifacts.summaries.bullet_12.forEach(point => {
          content += `• ${point}\n`;
        });
        content += '\n';
      }
      
      // Action Items
      if (meeting.artifacts.action_items.length > 0) {
        content += `✅ ACTION ITEMS:\n`;
        meeting.artifacts.action_items.forEach(item => {
          content += `• ${item.title} (${item.assignee}) - ${item.priority}\n`;
        });
        content += '\n';
      }
      
      // Decisions
      if (meeting.artifacts.decisions.length > 0) {
        content += `🎯 DECISIONS:\n`;
        meeting.artifacts.decisions.forEach(decision => {
          content += `• ${decision.statement}\n`;
        });
        content += '\n';
      }
      
      // Open Questions
      if (meeting.artifacts.open_questions.length > 0) {
        content += `❓ OPEN QUESTIONS:\n`;
        meeting.artifacts.open_questions.forEach(question => {
          content += `• ${question.question}\n`;
        });
      }
    }
    
    return content;
  };

  const generateExportContent = (): string => {
    if (!meeting) return '';
    
    let content = `# Meeting Notes\n\n`;
    content += `**Title:** ${meeting.title}\n`;
    content += `**Date:** ${new Date(meeting.date).toLocaleString()}\n`;
    content += `**Duration:** ${formatDuration(meeting.duration)}\n`;
    content += `**Attendees:** ${meeting.attendees.map(a => a.name).join(', ')}\n\n`;
    
    if (meeting.artifacts) {
      content += `## Executive Summary\n${meeting.artifacts.summaries?.executive_120w || 'N/A'}\n\n`;
      
      content += `## Detailed Summary\n${meeting.artifacts.summaries?.detailed_400w || 'N/A'}\n\n`;
      
      if (meeting.artifacts.action_items.length > 0) {
        content += `## Action Items\n`;
        meeting.artifacts.action_items.forEach(item => {
          content += `- **${item.title}**\n`;
          content += `  - Assignee: ${item.assignee}\n`;
          content += `  - Priority: ${item.priority}\n`;
          if (item.due_date) content += `  - Due: ${item.due_date}\n`;
          content += '\n';
        });
      }
      
      if (meeting.artifacts.decisions.length > 0) {
        content += `## Decisions\n`;
        meeting.artifacts.decisions.forEach(decision => {
          content += `- ${decision.statement}\n`;
          if (decision.rationale) content += `  - Rationale: ${decision.rationale}\n`;
          content += '\n';
        });
      }
      
      if (meeting.artifacts.open_questions.length > 0) {
        content += `## Open Questions\n`;
        meeting.artifacts.open_questions.forEach(question => {
          content += `- ${question.question}\n`;
          if (question.owner) content += `  - Owner: ${question.owner}\n`;
          content += '\n';
        });
      }
    }
    
    return content;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
  };

  if (!meeting) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <Text style={styles.loadingText}>Loading meeting...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          
          <View style={styles.headerTitle}>
            <Text style={styles.title} numberOfLines={1}>{meeting.title}</Text>
            <Text style={styles.subtitle}>
              {new Date(meeting.date).toLocaleDateString()} • {formatDuration(meeting.duration)}
            </Text>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
              <Share2 size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.iconButton}>
              <Trash2 size={20} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Bar */}
        {meeting.status !== 'completed' && (
          <View style={[styles.statusBar, meeting.status === 'error' && styles.errorBar]}>
            <Text style={styles.statusText}>
              {meeting.status === 'processing' ? 'Processing meeting...' : 
               meeting.status === 'error' ? 'Processing failed' : 
               'Recording saved'}
            </Text>
            {meeting.status === 'error' && (
              <TouchableOpacity onPress={handleProcess} style={styles.retryButton}>
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Processing Progress */}
        {isProcessing && processingProgress && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>{processingProgress.message}</Text>
            <View style={styles.progressBar}>
              <View 
                style={[styles.progressFill, { width: `${processingProgress.progress}%` }]} 
              />
            </View>
            {processingProgress.currentChunk && (
              <Text style={styles.chunkText}>
                Chunk {processingProgress.currentChunk} of {processingProgress.totalChunks}
              </Text>
            )}
          </View>
        )}

        {/* View Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, activeView === 'insights' && styles.activeToggle]}
            onPress={() => setActiveView('insights')}
          >
            <FileText size={16} color={activeView === 'insights' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.toggleText, activeView === 'insights' && styles.activeToggleText]}>
              Insights
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.toggleButton, activeView === 'translation' && styles.activeToggle]}
            onPress={() => setActiveView('translation')}
          >
            <Languages size={16} color={activeView === 'translation' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.toggleText, activeView === 'translation' && styles.activeToggleText]}>
              Translation
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeView === 'insights' && meeting.artifacts ? (
          <MeetingInsights
            artifacts={meeting.artifacts}
            duration={meeting.duration}
            attendees={meeting.attendees.map(a => a.name)}
          />
        ) : activeView === 'translation' && meeting.artifacts ? (
          <MeetingTranslation
            artifacts={meeting.artifacts}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {meeting.status === 'processing' ? 'Processing in progress...' : 'No data available yet'}
            </Text>
            {(meeting.status === 'recording' || meeting.status === 'error') && (
              <TouchableOpacity style={styles.processButton} onPress={handleProcess}>
                <Text style={styles.processButtonText}>Process Meeting</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action Bar */}
        {meeting.artifacts && (
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionButton} onPress={handleExport}>
              <Download size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton} onPress={handleEmailDraft}>
              <Mail size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Share Summary</Text>
            </TouchableOpacity>
          </View>
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  statusBar: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBar: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  retryText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  progressContainer: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  progressText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF8C00',
  },
  chunkText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  viewToggle: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  activeToggle: {
    backgroundColor: '#FF8C00',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeToggleText: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  processButton: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  processButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF8C00',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});