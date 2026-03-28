import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { TrendingUp, Users, Clock, Target, CheckCircle, HelpCircle, Hash } from 'lucide-react-native';
import { MeetingArtifacts } from '@/types/meeting';

interface MeetingInsightsProps {
  artifacts: MeetingArtifacts;
  duration: number;
  attendees: string[];
}

export default function MeetingInsights({ artifacts, duration, attendees }: MeetingInsightsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'decisions' | 'questions'>('overview');

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return '#DC2626';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getTopKeywords = (): string[] => {
    // Extract keywords from summaries and action items
    const text = [
      artifacts.summaries?.executive_120w || '',
      ...artifacts.action_items.map(item => item.title),
      ...artifacts.decisions.map(d => d.statement)
    ].join(' ').toLowerCase();
    
    // Simple keyword extraction (in production, use NLP)
    const words = text.split(/\W+/).filter(w => w.length > 4);
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  };

  const keywords = getTopKeywords();

  return (
    <View style={styles.container}>
      {/* Tab Navigation */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.tabContainer}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <TrendingUp size={16} color={activeTab === 'overview' ? '#FF8C00' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'actions' && styles.activeTab]}
          onPress={() => setActiveTab('actions')}
        >
          <Target size={16} color={activeTab === 'actions' ? '#FF8C00' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'actions' && styles.activeTabText]}>
            Actions ({artifacts.action_items.length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'decisions' && styles.activeTab]}
          onPress={() => setActiveTab('decisions')}
        >
          <CheckCircle size={16} color={activeTab === 'decisions' ? '#FF8C00' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'decisions' && styles.activeTabText]}>
            Decisions ({artifacts.decisions.length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'questions' && styles.activeTab]}
          onPress={() => setActiveTab('questions')}
        >
          <HelpCircle size={16} color={activeTab === 'questions' ? '#FF8C00' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'questions' && styles.activeTabText]}>
            Questions ({artifacts.open_questions.length})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'overview' && (
          <View>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Clock size={20} color="#FF8C00" />
                <Text style={styles.statValue}>{formatDuration(duration)}</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
              
              <View style={styles.statCard}>
                <Users size={20} color="#FF8C00" />
                <Text style={styles.statValue}>{attendees.length}</Text>
                <Text style={styles.statLabel}>Attendees</Text>
              </View>
              
              <View style={styles.statCard}>
                <Target size={20} color="#FF8C00" />
                <Text style={styles.statValue}>{artifacts.action_items.length}</Text>
                <Text style={styles.statLabel}>Actions</Text>
              </View>
              
              <View style={styles.statCard}>
                <CheckCircle size={20} color="#FF8C00" />
                <Text style={styles.statValue}>{artifacts.decisions.length}</Text>
                <Text style={styles.statLabel}>Decisions</Text>
              </View>
            </View>

            {/* Executive Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Executive Summary</Text>
              <Text style={styles.summaryText}>
                {artifacts.summaries?.executive_120w || 'No summary available'}
              </Text>
            </View>

            {/* Key Points */}
            {artifacts.summaries?.bullet_12 && artifacts.summaries.bullet_12.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Key Points</Text>
                {artifacts.summaries.bullet_12.map((point, index) => (
                  <View key={index} style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{point}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Keywords */}
            {keywords.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Keywords</Text>
                <View style={styles.keywordsContainer}>
                  {keywords.map((keyword, index) => (
                    <View key={index} style={styles.keyword}>
                      <Hash size={12} color="#FF8C00" />
                      <Text style={styles.keywordText}>{keyword}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'actions' && (
          <View>
            {artifacts.action_items.length > 0 ? (
              artifacts.action_items.map((item, index) => (
                <View key={item.id || index} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View 
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(item.priority) + '20' }
                      ]}
                    >
                      <Text 
                        style={[
                          styles.priorityText,
                          { color: getPriorityColor(item.priority) }
                        ]}
                      >
                        {item.priority}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.cardMeta}>
                    <Text style={styles.metaText}>
                      Assigned to: {item.assignee || 'Unassigned'}
                    </Text>
                    {item.due_date && (
                      <Text style={styles.metaText}>
                        Due: {new Date(item.due_date).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  
                  {item.source_quote && (
                    <Text style={styles.quote}>&ldquo;{item.source_quote}&rdquo;</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No action items identified</Text>
            )}
          </View>
        )}

        {activeTab === 'decisions' && (
          <View>
            {artifacts.decisions.length > 0 ? (
              artifacts.decisions.map((decision, index) => (
                <View key={decision.id || index} style={styles.card}>
                  <Text style={styles.cardTitle}>{decision.statement}</Text>
                  {decision.rationale && (
                    <Text style={styles.rationale}>
                      Rationale: {decision.rationale}
                    </Text>
                  )}
                  {decision.source_quote && (
                    <Text style={styles.quote}>&ldquo;{decision.source_quote}&rdquo;</Text>
                  )}
                  {decision.confidence && (
                    <View style={styles.confidenceBar}>
                      <Text style={styles.confidenceLabel}>
                        Confidence: {Math.round(decision.confidence * 100)}%
                      </Text>
                      <View style={styles.confidenceTrack}>
                        <View 
                          style={[
                            styles.confidenceFill,
                            { width: `${decision.confidence * 100}%` }
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No decisions recorded</Text>
            )}
          </View>
        )}

        {activeTab === 'questions' && (
          <View>
            {artifacts.open_questions.length > 0 ? (
              artifacts.open_questions.map((question, index) => (
                <View key={question.id || index} style={styles.card}>
                  <View style={styles.questionHeader}>
                    <HelpCircle size={18} color="#FF8C00" />
                    <Text style={styles.cardTitle}>{question.question}</Text>
                  </View>
                  {question.owner && (
                    <Text style={styles.metaText}>
                      Owner: {question.owner}
                    </Text>
                  )}
                  {question.needed_by && (
                    <Text style={styles.metaText}>
                      Needed by: {question.needed_by}
                    </Text>
                  )}
                  {question.source_quote && (
                    <Text style={styles.quote}>&ldquo;{question.source_quote}&rdquo;</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No open questions</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    maxHeight: 50,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF8C00',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FF8C00',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF7ED',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#FF8C00',
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyword: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  keywordText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardMeta: {
    marginBottom: 8,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  quote: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6B7280',
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#D1D5DB',
  },
  rationale: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
  },
  confidenceBar: {
    marginTop: 12,
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  confidenceTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#FF8C00',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 32,
  },
});