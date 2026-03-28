import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { RotateCcw, Copy, Share, ChevronDown, ChevronUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

interface MeetingArtifacts {
  summaries?: {
    executive_120w?: string;
    detailed_400w?: string;
    bullet_12?: string[];
  };
  action_items: Array<{
    title: string;
    assignee: string;
    priority: string;
    due_date?: string;
    status?: string;
  }>;
  decisions: Array<{
    statement: string;
    rationale?: string;
  }>;
  open_questions: Array<{
    question: string;
    owner?: string;
    needed_by?: string;
  }>;
}

interface MeetingTranslationProps {
  artifacts: MeetingArtifacts;
}

interface TranslatedContent {
  summary?: string;
  keyPoints?: string[];
  actionItems?: Array<{
    title: string;
    assignee: string;
    priority: string;
    due_date?: string;
  }>;
  decisions?: Array<{
    statement: string;
    rationale?: string;
  }>;
}

const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
];

export default function MeetingTranslation({ artifacts }: MeetingTranslationProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [showLanguageSelector, setShowLanguageSelector] = useState<boolean>(false);
  const [translatedContent, setTranslatedContent] = useState<TranslatedContent | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const translateContent = async () => {
    if (isTranslating) return;
    
    setIsTranslating(true);
    try {
      const targetLanguage = supportedLanguages.find(l => l.code === selectedLanguage);
      if (!targetLanguage) return;

      const translated: TranslatedContent = {};

      // Translate summary
      if (artifacts.summaries?.executive_120w) {
        const summaryResponse = await fetch('https://toolkit.rork.com/text/llm/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the following meeting summary to ${targetLanguage.name}. Maintain the professional tone and structure. Only return the translated text, nothing else.`
              },
              {
                role: 'user',
                content: artifacts.summaries.executive_120w
              }
            ]
          })
        });
        
        if (summaryResponse.ok) {
          const result = await summaryResponse.json();
          translated.summary = result.completion;
        }
      }

      // Translate key points
      if (artifacts.summaries?.bullet_12 && artifacts.summaries.bullet_12.length > 0) {
        const keyPointsText = artifacts.summaries.bullet_12.join('\n• ');
        const keyPointsResponse = await fetch('https://toolkit.rork.com/text/llm/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the following key points to ${targetLanguage.name}. Return them as a bullet list, one point per line starting with '• '. Only return the translated bullet points, nothing else.`
              },
              {
                role: 'user',
                content: `• ${keyPointsText}`
              }
            ]
          })
        });
        
        if (keyPointsResponse.ok) {
          const result = await keyPointsResponse.json();
          translated.keyPoints = result.completion
            .split('\n')
            .filter((line: string) => line.trim().startsWith('•'))
            .map((line: string) => line.replace('•', '').trim());
        }
      }

      // Translate action items
      if (artifacts.action_items.length > 0) {
        const actionItemsText = artifacts.action_items
          .map(item => `${item.title} (Assigned to: ${item.assignee}, Priority: ${item.priority})`)
          .join('\n');
        
        const actionItemsResponse = await fetch('https://toolkit.rork.com/text/llm/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the following action items to ${targetLanguage.name}. Keep the structure: "Title (Assigned to: Name, Priority: Level)". Return one item per line. Only return the translated action items, nothing else.`
              },
              {
                role: 'user',
                content: actionItemsText
              }
            ]
          })
        });
        
        if (actionItemsResponse.ok) {
          const result = await actionItemsResponse.json();
          const translatedItems = result.completion.split('\n').filter((line: string) => line.trim());
          translated.actionItems = translatedItems.map((item: string, index: number) => {
            const original = artifacts.action_items[index];
            return {
              title: item.split(' (')[0] || item,
              assignee: original?.assignee || '',
              priority: original?.priority || '',
              due_date: original?.due_date
            };
          });
        }
      }

      // Translate decisions
      if (artifacts.decisions.length > 0) {
        const decisionsText = artifacts.decisions
          .map(decision => `${decision.statement}${decision.rationale ? ` (Rationale: ${decision.rationale})` : ''}`)
          .join('\n');
        
        const decisionsResponse = await fetch('https://toolkit.rork.com/text/llm/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the following decisions to ${targetLanguage.name}. Keep the structure if rationale exists: "Decision (Rationale: reason)". Return one decision per line. Only return the translated decisions, nothing else.`
              },
              {
                role: 'user',
                content: decisionsText
              }
            ]
          })
        });
        
        if (decisionsResponse.ok) {
          const result = await decisionsResponse.json();
          const translatedDecisions = result.completion.split('\n').filter((line: string) => line.trim());
          translated.decisions = translatedDecisions.map((decision: string, index: number) => {
            const original = artifacts.decisions[index];
            const parts = decision.split(' (Rationale: ');
            return {
              statement: parts[0] || decision,
              rationale: parts[1] ? parts[1].replace(')', '') : original?.rationale
            };
          });
        }
      }

      setTranslatedContent(translated);
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!text.trim()) return;
      
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
        console.log('Content copied to clipboard');
      } else {
        await Clipboard.setStringAsync(text);
        console.log('Content copied to clipboard');
      }
    } catch (error) {
      console.error('Copy error:', error);
    }
  };

  const shareContent = async () => {
    if (!translatedContent) return;
    
    try {
      const targetLanguage = supportedLanguages.find(l => l.code === selectedLanguage);
      let content = `Meeting Summary (${targetLanguage?.name})\n\n`;
      
      if (translatedContent.summary) {
        content += `📋 SUMMARY:\n${translatedContent.summary}\n\n`;
      }
      
      if (translatedContent.keyPoints && translatedContent.keyPoints.length > 0) {
        content += `🔑 KEY POINTS:\n`;
        translatedContent.keyPoints.forEach(point => {
          content += `• ${point}\n`;
        });
        content += '\n';
      }
      
      if (translatedContent.actionItems && translatedContent.actionItems.length > 0) {
        content += `✅ ACTION ITEMS:\n`;
        translatedContent.actionItems.forEach(item => {
          content += `• ${item.title} (${item.assignee}) - ${item.priority}\n`;
        });
        content += '\n';
      }
      
      if (translatedContent.decisions && translatedContent.decisions.length > 0) {
        content += `🎯 DECISIONS:\n`;
        translatedContent.decisions.forEach(decision => {
          content += `• ${decision.statement}\n`;
        });
      }
      
      if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(content);
      } else {
        await copyToClipboard(content);
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const getLanguageName = (code: string) => {
    return supportedLanguages.find(l => l.code === code)?.name || code;
  };

  const getLanguageFlag = (code: string) => {
    return supportedLanguages.find(l => l.code === code)?.flag || '🌐';
  };

  return (
    <View style={styles.container}>
      {/* Language Selector */}
      <View style={styles.languageSelector}>
        <Text style={styles.selectorLabel}>Translate to:</Text>
        <TouchableOpacity 
          style={styles.languageButton}
          onPress={() => setShowLanguageSelector(!showLanguageSelector)}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(selectedLanguage)}</Text>
          <Text style={styles.languageName}>{getLanguageName(selectedLanguage)}</Text>
          <ChevronDown size={16} color="#6B7280" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.translateButton, isTranslating && styles.translatingButton]}
          onPress={translateContent}
          disabled={isTranslating}
        >
          {isTranslating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <RotateCcw size={16} color="#FFFFFF" />
          )}
          <Text style={styles.translateButtonText}>
            {isTranslating ? 'Translating...' : 'Translate'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Language Selection Modal */}
      {showLanguageSelector && (
        <View style={styles.languageModal}>
          <ScrollView style={styles.languageList}>
            {supportedLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageOption,
                  selectedLanguage === lang.code && styles.selectedLanguageOption
                ]}
                onPress={() => {
                  setSelectedLanguage(lang.code);
                  setShowLanguageSelector(false);
                  setTranslatedContent(null); // Clear previous translation
                }}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <Text style={styles.languageOptionName}>{lang.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity 
            style={styles.closeModal}
            onPress={() => setShowLanguageSelector(false)}
          >
            <Text style={styles.closeModalText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {!translatedContent ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Select a language and tap "Translate" to see the meeting content in your chosen language</Text>
            <Text style={styles.emptyStateSubtext}>
              Translation includes: Summary, Key Points, Action Items, and Decisions
            </Text>
          </View>
        ) : (
          <View style={styles.translatedContent}>
            {/* Summary Section */}
            {translatedContent.summary && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => toggleSection('summary')}
                >
                  <Text style={styles.sectionTitle}>📋 Summary</Text>
                  <View style={styles.sectionActions}>
                    <TouchableOpacity 
                      onPress={() => copyToClipboard(translatedContent.summary || '')}
                      style={styles.actionButton}
                    >
                      <Copy size={16} color="#6B7280" />
                    </TouchableOpacity>
                    {expandedSections.has('summary') ? (
                      <ChevronUp size={20} color="#6B7280" />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" />
                    )}
                  </View>
                </TouchableOpacity>
                
                {expandedSections.has('summary') && (
                  <LinearGradient
                    colors={['#FF8C00', '#FF6B35']}
                    style={styles.contentCard}
                  >
                    <Text style={styles.translatedText}>{translatedContent.summary}</Text>
                  </LinearGradient>
                )}
              </View>
            )}

            {/* Key Points Section */}
            {translatedContent.keyPoints && translatedContent.keyPoints.length > 0 && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => toggleSection('keyPoints')}
                >
                  <Text style={styles.sectionTitle}>🔑 Key Points</Text>
                  <View style={styles.sectionActions}>
                    <TouchableOpacity 
                      onPress={() => copyToClipboard(translatedContent.keyPoints?.join('\n• ') || '')}
                      style={styles.actionButton}
                    >
                      <Copy size={16} color="#6B7280" />
                    </TouchableOpacity>
                    {expandedSections.has('keyPoints') ? (
                      <ChevronUp size={20} color="#6B7280" />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" />
                    )}
                  </View>
                </TouchableOpacity>
                
                {expandedSections.has('keyPoints') && (
                  <LinearGradient
                    colors={['#4ECDC4', '#44A08D']}
                    style={styles.contentCard}
                  >
                    {translatedContent.keyPoints.map((point, index) => (
                      <Text key={index} style={styles.bulletPoint}>• {point}</Text>
                    ))}
                  </LinearGradient>
                )}
              </View>
            )}

            {/* Action Items Section */}
            {translatedContent.actionItems && translatedContent.actionItems.length > 0 && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => toggleSection('actionItems')}
                >
                  <Text style={styles.sectionTitle}>✅ Action Items</Text>
                  <View style={styles.sectionActions}>
                    <TouchableOpacity 
                      onPress={() => {
                        const actionText = translatedContent.actionItems?.map(item => 
                          `${item.title} (${item.assignee}) - ${item.priority}`
                        ).join('\n') || '';
                        copyToClipboard(actionText);
                      }}
                      style={styles.actionButton}
                    >
                      <Copy size={16} color="#6B7280" />
                    </TouchableOpacity>
                    {expandedSections.has('actionItems') ? (
                      <ChevronUp size={20} color="#6B7280" />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" />
                    )}
                  </View>
                </TouchableOpacity>
                
                {expandedSections.has('actionItems') && (
                  <LinearGradient
                    colors={['#A8E6CF', '#7FCDCD']}
                    style={styles.contentCard}
                  >
                    {translatedContent.actionItems.map((item, index) => (
                      <View key={index} style={styles.actionItem}>
                        <Text style={styles.actionTitle}>{item.title}</Text>
                        <Text style={styles.actionMeta}>
                          {item.assignee} • {item.priority}
                          {item.due_date && ` • Due: ${new Date(item.due_date).toLocaleDateString()}`}
                        </Text>
                      </View>
                    ))}
                  </LinearGradient>
                )}
              </View>
            )}

            {/* Decisions Section */}
            {translatedContent.decisions && translatedContent.decisions.length > 0 && (
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => toggleSection('decisions')}
                >
                  <Text style={styles.sectionTitle}>🎯 Decisions</Text>
                  <View style={styles.sectionActions}>
                    <TouchableOpacity 
                      onPress={() => {
                        const decisionsText = translatedContent.decisions?.map(decision => 
                          decision.statement
                        ).join('\n') || '';
                        copyToClipboard(decisionsText);
                      }}
                      style={styles.actionButton}
                    >
                      <Copy size={16} color="#6B7280" />
                    </TouchableOpacity>
                    {expandedSections.has('decisions') ? (
                      <ChevronUp size={20} color="#6B7280" />
                    ) : (
                      <ChevronDown size={20} color="#6B7280" />
                    )}
                  </View>
                </TouchableOpacity>
                
                {expandedSections.has('decisions') && (
                  <LinearGradient
                    colors={['#FFD93D', '#FF6B6B']}
                    style={styles.contentCard}
                  >
                    {translatedContent.decisions.map((decision, index) => (
                      <View key={index} style={styles.decisionItem}>
                        <Text style={styles.decisionStatement}>{decision.statement}</Text>
                        {decision.rationale && (
                          <Text style={styles.decisionRationale}>Rationale: {decision.rationale}</Text>
                        )}
                      </View>
                    ))}
                  </LinearGradient>
                )}
              </View>
            )}

            {/* Share Button */}
            <TouchableOpacity style={styles.shareButton} onPress={shareContent}>
              <Share size={20} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>Share Translation</Text>
            </TouchableOpacity>
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
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  languageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 8,
  },
  languageFlag: {
    fontSize: 18,
  },
  languageName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  translatingButton: {
    backgroundColor: '#6B7280',
  },
  translateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  languageModal: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: 300,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  languageList: {
    maxHeight: 240,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  selectedLanguageOption: {
    backgroundColor: '#FEF3C7',
  },
  languageOptionName: {
    fontSize: 14,
    color: '#374151',
  },
  closeModal: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  closeModalText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF8C00',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  translatedContent: {
    paddingVertical: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  contentCard: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  translatedText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 4,
  },
  actionItem: {
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  actionMeta: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  decisionItem: {
    marginBottom: 12,
  },
  decisionStatement: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  decisionRationale: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.9,
    fontStyle: 'italic',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});