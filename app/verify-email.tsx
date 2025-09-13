import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Mail, ArrowRight, ArrowLeft, Shield } from 'lucide-react-native';
import { useAuth } from '@/hooks/auth-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function VerifyEmailScreen() {
  const { verifyEmail, resendVerificationCode } = useAuth();
  const params = useLocalSearchParams();
  const email = params.email as string;
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [verificationCodeFromStorage, setVerificationCodeFromStorage] = useState<string | null>(null);

  useEffect(() => {
    // For development: show the verification code in console
    (async () => {
      const pendingData = await AsyncStorage.getItem('pending_verification');
      if (pendingData) {
        const user = JSON.parse(pendingData);
        if (user.verificationCode) {
          setVerificationCodeFromStorage(user.verificationCode);
          console.log('Verification code for', user.email, ':', user.verificationCode);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setResendDisabled(false);
    }
  }, [resendTimer]);

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Missing Code', 'Please enter the verification code.');
      return;
    }

    if (verificationCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyEmail(verificationCode, email);
      
      if (result.success) {
        // Directly navigate to home without showing alert
        router.replace('/(tabs)/home');
      } else {
        Alert.alert('Verification Failed', result.error || 'Invalid verification code. Please try again.');
      }
    } catch (error) {
      console.error('Verification error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      Alert.alert('Error', 'Email address not found. Please go back and try again.');
      return;
    }

    setResendDisabled(true);
    setResendTimer(60); // 60 second cooldown
    
    try {
      const result = await resendVerificationCode(email);
      
      if (result.success) {
        Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
        // Update the displayed code for development
        const pendingData = await AsyncStorage.getItem('pending_verification');
        if (pendingData) {
          const user = JSON.parse(pendingData);
          if (user.verificationCode) {
            setVerificationCodeFromStorage(user.verificationCode);
            console.log('New verification code for', user.email, ':', user.verificationCode);
          }
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to resend verification code.');
        setResendDisabled(false);
        setResendTimer(0);
      }
    } catch (error) {
      console.error('Resend error:', error);
      Alert.alert('Error', 'Failed to resend verification code.');
      setResendDisabled(false);
      setResendTimer(0);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
      
        <KeyboardAvoidingView 
          style={styles.keyboardView} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
              <ArrowLeft size={24} color="#6B7280" />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Shield size={48} color="#3B82F6" />
              </View>
              <Text style={styles.title}>Verify Your Email</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit verification code sent to {email || 'your email address'}.
              </Text>
              {verificationCodeFromStorage && Platform.OS !== 'web' && __DEV__ && (
                <Text style={styles.devCode}>Dev Code: {verificationCodeFromStorage}</Text>
              )}
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <View style={styles.inputContainer}>
                  <Mail size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    placeholder="123456"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.verifyButton, isLoading && styles.verifyButtonDisabled]} 
                onPress={handleVerifyCode}
                disabled={isLoading}
              >
                <Text style={styles.verifyButtonText}>
                  {isLoading ? 'Verifying...' : 'Verify Email'}
                </Text>
                {!isLoading && <ArrowRight size={20} color="#FFFFFF" />}
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.resendButton, resendDisabled && styles.resendButtonDisabled]} 
                onPress={handleResendCode}
                disabled={resendDisabled}
              >
                <Text style={[styles.resendButtonText, resendDisabled && styles.resendButtonTextDisabled]}>
                  {resendDisabled 
                    ? `Resend code in ${resendTimer}s` 
                    : "Didn't receive the code? Resend"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 32,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 20,
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 4,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  verifyButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 24,
  },
  resendButtonText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonTextDisabled: {
    color: '#6B7280',
  },
  devCode: {
    marginTop: 8,
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
});