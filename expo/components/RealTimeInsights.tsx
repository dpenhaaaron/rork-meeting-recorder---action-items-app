import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MeetingArtifacts } from '@/types/meeting';
import { Clock, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react-native';

interface RealTimeInsightsProps {
  artifacts: MeetingArtifacts | null;
  isProcessing: boolean;
  duration: number;
}

export const RealTimeInsights: React.FC<RealTimeInsightsProps> = ({
  artifacts,
  isProcessing,
  duration
}) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!artifacts && !isProcessing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Clock size={20} color="#FF8C00" />
          <Text style={styles.headerText}>Live Insights</Text>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Real-time analysis will appear here as the conversation progresses...
          </Text>
        </View>
      </View>
    );
  }

  if (isProcessing && !artifacts) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Clock size={20} color="#FF8C00" />
          <Text style={styles.headerText}>Live Insights</Text>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>
        <View style={styles.processingState}>
          <Text style={styles.processingText}>
            🎤 Analyzing conversation...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Clock size={20} color="#FF8C00" />
        <Text style={styles.headerText}>Live Insights</Text>
        <Text style={styles.duration}>{formatDuration(duration)}</Text>
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <Text style={styles.processingDot}>●</Text>
          </View>
        )}
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Executive Summary */}
        {artifacts?.summaries?.executive_120w && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Current Summary</Text>
            <Text style={styles.summaryText}>{artifacts.summaries.executive_120w}</Text>
          </View>
        )}

        {/* Action Items */}
        {artifacts?.action_items && artifacts.action_items.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <CheckCircle size={16} color="#FF8C00" />
              <Text style={styles.sectionTitle}>Action Items ({artifacts.action_items.length})</Text>
            </View>
            {artifacts.action_items.slice(0, 3).map((item, index) => (
              <View key={item.id || index} style={styles.actionItem}>
                <View style={styles.actionHeader}>
                  <Text style={styles.actionTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={[styles.priorityBadge, getPriorityStyle(item.priority)]}>
                    <Text style={styles.priorityText}>{item.priority}</Text>
                  </View>
                </View>
                {item.assignee && (
                  <Text style={styles.assignee}>👤 {item.assignee}</Text>
                )}
              </View>
            ))}
            {artifacts.action_items.length > 3 && (
              <Text style={styles.moreItems}>
                +{artifacts.action_items.length - 3} more items
              </Text>
            )}
          </View>
        )}

        {/* Decisions */}
        {artifacts?.decisions && artifacts.decisions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlertCircle size={16} color="#FF8C00" />
              <Text style={styles.sectionTitle}>Decisions ({artifacts.decisions.length})</Text>
            </View>
            {artifacts.decisions.slice(0, 2).map((decision, index) => (
              <View key={decision.id || index} style={styles.decisionItem}>
                <Text style={styles.decisionText} numberOfLines={3}>
                  {decision.statement}
                </Text>
              </View>
            ))}
            {artifacts.decisions.length > 2 && (
              <Text style={styles.moreItems}>
                +{artifacts.decisions.length - 2} more decisions
              </Text>
            )}
          </View>
        )}

        {/* Open Questions */}
        {artifacts?.open_questions && artifacts.open_questions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <HelpCircle size={16} color="#FF8C00" />
              <Text style={styles.sectionTitle}>Open Questions ({artifacts.open_questions.length})</Text>
            </View>
            {artifacts.open_questions.slice(0, 2).map((question, index) => (
              <View key={question.id || index} style={styles.questionItem}>
                <Text style={styles.questionText} numberOfLines={2}>
                  {question.question}
                </Text>
              </View>
            ))}
            {artifacts.open_questions.length > 2 && (
              <Text style={styles.moreItems}>
                +{artifacts.open_questions.length - 2} more questions
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const getPriorityStyle = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case 'high':
      return { backgroundColor: '#FFE5E5' };
    case 'medium':
      return { backgroundColor: '#FFF5E5' };
    case 'low':
      return { backgroundColor: '#E5F5E5' };
    default:
      return { backgroundColor: '#F0F0F0' };
  }
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  duration: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  processingIndicator: {
    marginLeft: 8,
  },
  processingDot: {
    color: '#FF8C00',
    fontSize: 16,
  },
  content: {
    maxHeight: 300,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  processingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  processingText: {
    fontSize: 14,
    color: '#FF8C00',
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
  },
  actionItem: {
    backgroundColor: '#FFF8F0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C00',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  assignee: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  decisionItem: {
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4A90E2',
  },
  decisionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 18,
  },
  questionItem: {
    backgroundColor: '#FFF5F0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#E67E22',
  },
  questionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 18,
  },
  moreItems: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});