import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mic, MicOff, Volume2, VolumeX, RotateCcw, Copy, Share } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

interface TranslationMessage {
  id: string;
  originalText: string;
  translatedText: string;
  fromLanguage: string;
  toLanguage: string;
  timestamp: Date;
  isUser: boolean;
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

export default function TranslateScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [fromLanguage, setFromLanguage] = useState('en');
  const [toLanguage, setToLanguage] = useState('es');
  const [messages, setMessages] = useState<TranslationMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState<'from' | 'to' | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setupAudio();
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    };
  }, []);

  const setupAudio = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    } catch (error) {
      console.error('Audio setup error:', error);
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      
      if (Platform.OS === 'web') {
        // Web implementation using MediaRecorder
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event) => {
          chunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: 'audio/wav' });
          await processAudio(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        (recordingRef as any).current = { mediaRecorder, stream };
      } else {
        // Mobile implementation using expo-av
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
      }
    } catch (error) {
      console.error('Recording start error:', error);
      setIsRecording(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Recording Error', 'Failed to start recording. Please check microphone permissions.');
      } else {
        console.error('Recording Error: Failed to start recording. Please check microphone permissions.');
      }
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);
      
      if (Platform.OS === 'web') {
        const { mediaRecorder } = (recordingRef as any).current || {};
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      } else {
        if (recordingRef.current) {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();
          if (uri) {
            await processAudioFromUri(uri);
          }
          recordingRef.current = null;
        }
      }
    } catch (error) {
      console.error('Recording stop error:', error);
      setIsProcessing(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Recording Error', 'Failed to stop recording.');
      } else {
        console.error('Recording Error: Failed to stop recording.');
      }
    }
  };

  const processAudioFromUri = async (uri: string) => {
    try {
      if (!uri.trim()) {
        setIsProcessing(false);
        return;
      }

      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];
      
      const formData = new FormData();
      formData.append('audio', {
        uri,
        name: `recording.${fileType}`,
        type: `audio/${fileType}`,
      } as any);
      
      formData.append('language', fromLanguage);
      
      const response = await fetch('https://toolkit.rork.com/stt/transcribe/', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const result = await response.json();
      await translateText(result.text);
    } catch (error) {
      console.error('Audio processing error:', error);
      setIsProcessing(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Processing Error', 'Failed to process audio. Please try again.');
      } else {
        console.error('Processing Error: Failed to process audio. Please try again.');
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      if (!audioBlob || audioBlob.size === 0) {
        setIsProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      formData.append('language', fromLanguage);
      
      const response = await fetch('https://toolkit.rork.com/stt/transcribe/', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const result = await response.json();
      await translateText(result.text);
    } catch (error) {
      console.error('Audio processing error:', error);
      setIsProcessing(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Processing Error', 'Failed to process audio. Please try again.');
      } else {
        console.error('Processing Error: Failed to process audio. Please try again.');
      }
    }
  };

  const translateText = async (text: string) => {
    try {
      if (!text.trim()) {
        setIsProcessing(false);
        return;
      }

      const fromLang = supportedLanguages.find(l => l.code === fromLanguage);
      const toLang = supportedLanguages.find(l => l.code === toLanguage);
      
      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the following text from ${fromLang?.name} to ${toLang?.name}. Only return the translated text, nothing else.`
            },
            {
              role: 'user',
              content: text
            }
          ]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      const newMessage: TranslationMessage = {
        id: Date.now().toString(),
        originalText: text,
        translatedText: result.completion,
        fromLanguage,
        toLanguage,
        timestamp: new Date(),
        isUser: true,
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      // Speak the translation if audio is enabled
      if (audioEnabled && Platform.OS !== 'web') {
        speakText(result.completion, toLanguage);
      }
      
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Translation error:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Translation Error', 'Failed to translate text. Please try again.');
      } else {
        console.error('Translation Error: Failed to translate text. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const speakText = async (text: string, language: string) => {
    try {
      if (Platform.OS !== 'web') {
        // This would require expo-speech or similar
        // For now, we'll just log it
        console.log(`Speaking: ${text} in ${language}`);
      }
    } catch (error) {
      console.error('Speech error:', error);
    }
  };

  const swapLanguages = () => {
    const temp = fromLanguage;
    setFromLanguage(toLanguage);
    setToLanguage(temp);
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!text.trim()) return;
      
      await Clipboard.setStringAsync(text);
      if (Platform.OS !== 'web') {
        Alert.alert('Copied', 'Text copied to clipboard');
      } else {
        console.log('Text copied to clipboard');
      }
    } catch (error) {
      console.error('Copy error:', error);
    }
  };

  const shareText = async (message: TranslationMessage) => {
    try {
      const shareContent = `Original (${supportedLanguages.find(l => l.code === message.fromLanguage)?.name}): ${message.originalText}\n\nTranslation (${supportedLanguages.find(l => l.code === message.toLanguage)?.name}): ${message.translatedText}`;
      
      if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareContent);
      } else {
        await copyToClipboard(shareContent);
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const clearConversation = () => {
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Clear Conversation',
        'Are you sure you want to clear all translations?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: () => setMessages([]) }
        ]
      );
    } else {
      if (confirm('Are you sure you want to clear all translations?')) {
        setMessages([]);
      }
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
      <Stack.Screen options={{ 
        title: 'Real-time Translator', 
        headerShown: true,
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTitleStyle: {
          color: '#FF8C00',
          fontWeight: 'bold',
        },
      }} />
      
      {/* Language Selector */}
      <View style={styles.languageSelector}>
        <TouchableOpacity 
          style={styles.languageButton}
          onPress={() => setShowLanguageSelector('from')}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(fromLanguage)}</Text>
          <Text style={styles.languageName}>{getLanguageName(fromLanguage)}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.swapButton} onPress={swapLanguages}>
          <RotateCcw size={20} color="#FF8C00" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.languageButton}
          onPress={() => setShowLanguageSelector('to')}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(toLanguage)}</Text>
          <Text style={styles.languageName}>{getLanguageName(toLanguage)}</Text>
        </TouchableOpacity>
      </View>

      {/* Language Selection Modal */}
      {showLanguageSelector && (
        <View style={styles.languageModal}>
          <ScrollView style={styles.languageList}>
            {supportedLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={styles.languageOption}
                onPress={() => {
                  if (showLanguageSelector === 'from') {
                    setFromLanguage(lang.code);
                  } else {
                    setToLanguage(lang.code);
                  }
                  setShowLanguageSelector(null);
                }}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <Text style={styles.languageOptionName}>{lang.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity 
            style={styles.closeModal}
            onPress={() => setShowLanguageSelector(null)}
          >
            <Text style={styles.closeModalText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Conversation */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.conversation}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Start speaking to translate</Text>
            <Text style={styles.emptyStateSubtext}>
              Tap the microphone to record your voice
            </Text>
          </View>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={styles.messageContainer}>
              <LinearGradient
                colors={['#FF8C00', '#FF6B35']}
                style={styles.messageCard}
              >
                <View style={styles.messageHeader}>
                  <Text style={styles.messageLanguage}>
                    {getLanguageFlag(message.fromLanguage)} {getLanguageName(message.fromLanguage)}
                  </Text>
                  <Text style={styles.messageTime}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.originalText}>{message.originalText}</Text>
                
                <View style={styles.divider} />
                
                <View style={styles.messageHeader}>
                  <Text style={styles.messageLanguage}>
                    {getLanguageFlag(message.toLanguage)} {getLanguageName(message.toLanguage)}
                  </Text>
                  <View style={styles.messageActions}>
                    <TouchableOpacity 
                      onPress={() => copyToClipboard(message.translatedText)}
                      style={styles.actionButton}
                    >
                      <Copy size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => shareText(message)}
                      style={styles.actionButton}
                    >
                      <Share size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.translatedText}>{message.translatedText}</Text>
              </LinearGradient>
            </View>
          ))
        )}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={styles.audioToggle}
          onPress={() => setAudioEnabled(!audioEnabled)}
        >
          {audioEnabled ? (
            <Volume2 size={24} color="#FF8C00" />
          ) : (
            <VolumeX size={24} color="#9CA3AF" />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordingButton,
            isProcessing && styles.processingButton
          ]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Text style={styles.processingText}>Processing...</Text>
          ) : isRecording ? (
            <MicOff size={32} color="#FFFFFF" />
          ) : (
            <Mic size={32} color="#FFFFFF" />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.clearButton}
          onPress={clearConversation}
          disabled={messages.length === 0}
        >
          <RotateCcw size={24} color={messages.length > 0 ? '#FF8C00' : '#9CA3AF'} />
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  languageFlag: {
    fontSize: 20,
    marginRight: 8,
  },
  languageName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  swapButton: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF8C00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  languageModal: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: 400,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  languageList: {
    maxHeight: 320,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  languageOptionName: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  closeModal: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  closeModalText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FF8C00',
  },
  conversation: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageContainer: {
    marginVertical: 8,
  },
  messageCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageLanguage: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  messageTime: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  messageActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  originalText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
    marginVertical: 12,
  },
  translatedText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  audioToggle: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  recordingButton: {
    backgroundColor: '#DC2626',
  },
  processingButton: {
    backgroundColor: '#6B7280',
  },
  processingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  clearButton: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
});