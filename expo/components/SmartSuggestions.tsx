import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Lightbulb, Clock, Users, Target, MessageSquare, Zap } from 'lucide-react-native';

interface SmartSuggestionsProps {
  isRecording: boolean;
  duration: number;
  speakerCount: number;
  actionItemsCount: number;
  questionsCount: number;
  onSuggestionTap?: (suggestion: string) => void;
}

interface Suggestion {
  id: string;
  type: 'action' | 'question' | 'summary' | 'time' | 'engagement';
  title: string;
  description: string;
  icon: React.ReactNode;
  priority: 'high' | 'medium' | 'low';
}

export default function SmartSuggestions({
  isRecording,
  duration,
  speakerCount,
  actionItemsCount,
  questionsCount,
  onSuggestionTap,
}: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!isRecording) return;

    const newSuggestions: Suggestion[] = [];

    // Time-based suggestions
    if (duration > 30 * 60) { // 30 minutes
      newSuggestions.push({
        id: 'long-meeting',
        type: 'time',
        title: 'Long Meeting Alert',
        description: 'Consider wrapping up or scheduling a follow-up',
        icon: <Clock size={16} color="#F59E0B" />,
        priority: 'high',
      });
    }

    // Engagement suggestions
    if (speakerCount === 1 && duration > 10 * 60) {
      newSuggestions.push({
        id: 'low-engagement',
        type: 'engagement',
        title: 'Low Participation',
        description: 'Try asking questions to engage others',
        icon: <Users size={16} color="#EF4444" />,
        priority: 'medium',
      });
    }

    // Action item suggestions
    if (duration > 15 * 60 && actionItemsCount === 0) {
      newSuggestions.push({
        id: 'no-actions',
        type: 'action',
        title: 'No Action Items',
        description: 'Consider defining next steps',
        icon: <Target size={16} color="#10B981" />,
        priority: 'medium',
      });
    }

    // Question tracking
    if (questionsCount > 3) {
      newSuggestions.push({
        id: 'many-questions',
        type: 'question',
        title: 'Many Open Questions',
        description: 'Schedule follow-up to address remaining items',
        icon: <MessageSquare size={16} color="#6366F1" />,
        priority: 'low',
      });
    }

    // Productivity suggestions
    if (duration > 20 * 60 && actionItemsCount < 2) {
      newSuggestions.push({
        id: 'low-productivity',
        type: 'summary',
        title: 'Summarize Key Points',
        description: 'Recap main decisions and next steps',
        icon: <Zap size={16} color="#FF8C00" />,
        priority: 'high',
      });
    }

    setSuggestions(newSuggestions);
  }, [isRecording, duration, speakerCount, actionItemsCount, questionsCount]);

  if (!isRecording || suggestions.length === 0) {
    return null;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#FEE2E2';
      case 'medium': return '#FEF3C7';
      case 'low': return '#DBEAFE';
      default: return '#F3F4F6';
    }
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#3B82F6';
      default: return '#E5E7EB';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Lightbulb size={18} color="#FF8C00" />
        <Text style={styles.title}>Smart Suggestions</Text>
      </View>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion.id}
            style={[
              styles.suggestionCard,
              { 
                backgroundColor: getPriorityColor(suggestion.priority),
                borderColor: getPriorityBorder(suggestion.priority),
              }
            ]}
            onPress={() => onSuggestionTap?.(suggestion.title)}
          >
            <View style={styles.suggestionHeader}>
              {suggestion.icon}
              <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
            </View>
            <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  suggestionsScroll: {
    flexDirection: 'row',
  },
  suggestionCard: {
    minWidth: 200,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  suggestionDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});