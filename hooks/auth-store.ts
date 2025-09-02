import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  email: string;
  fullName: string;
  location: string;
  locationCoords?: {
    latitude: number;
    longitude: number;
  };
  createdAt: string;
  isEmailVerified: boolean;
  isAdmin: boolean;
  verificationCode?: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AUTH_STORAGE_KEY = 'auth_user';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const loadStoredAuth = useCallback(async () => {
    try {
      const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setAuthState({
          user,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const signUp = useCallback(async (email: string, fullName: string, location: string, locationCoords?: { latitude: number; longitude: number }) => {
    try {
      // Check if admin email
      const isAdmin = email.toLowerCase().startsWith('admin@');
      
      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      const user: User = {
        id: Date.now().toString(),
        email,
        fullName,
        location,
        locationCoords,
        createdAt: new Date().toISOString(),
        isEmailVerified: false,
        isAdmin,
        verificationCode,
      };

      // Store user data for admin access
      await AsyncStorage.setItem(`user_${user.id}`, JSON.stringify(user));
      // Store pending verification data
      await AsyncStorage.setItem('pending_verification', JSON.stringify(user));
      
      // Simulate sending verification email
      console.log(`Verification email sent to ${email} with code: ${verificationCode}`);
      
      // Don't authenticate yet - user needs to verify email first
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });

      return { success: true, needsVerification: true, email };
    } catch (error) {
      console.error('Sign up failed:', error);
      return { success: false, error: 'Failed to create account' };
    }
  }, []);

  const signIn = useCallback(async (email: string) => {
    try {
      // Check all stored users
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const foundUser = userData.find(([key, value]) => {
        if (value) {
          try {
            const user = JSON.parse(value);
            return user.email === email;
          } catch {
            return false;
          }
        }
        return false;
      });
      
      if (foundUser && foundUser[1]) {
        const user = JSON.parse(foundUser[1]);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        
        setAuthState({
          user,
          isLoading: false,
          isAuthenticated: true,
        });
        return { success: true };
      }
      
      return { success: false, error: 'Account not found. Please sign up first.' };
    } catch (error) {
      console.error('Sign in failed:', error);
      return { success: false, error: 'Failed to sign in' };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }, []);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const verifyEmail = useCallback(async (code: string, email?: string) => {
    try {
      // Get pending verification data
      const pendingData = await AsyncStorage.getItem('pending_verification');
      if (!pendingData) {
        return { success: false, error: 'No pending verification found' };
      }
      
      const pendingUser = JSON.parse(pendingData) as User;
      
      // Check if email matches (if provided)
      if (email && pendingUser.email !== email) {
        return { success: false, error: 'Email does not match pending verification' };
      }
      
      // Verify the code
      if (code === pendingUser.verificationCode) {
        const updatedUser = { ...pendingUser, isEmailVerified: true };
        delete updatedUser.verificationCode; // Remove verification code after successful verification
        
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
        await AsyncStorage.setItem(`user_${updatedUser.id}`, JSON.stringify(updatedUser));
        await AsyncStorage.removeItem('pending_verification');
        
        setAuthState({
          user: updatedUser,
          isLoading: false,
          isAuthenticated: true,
        });
        
        return { success: true };
      }
      return { success: false, error: 'Invalid verification code' };
    } catch (error) {
      console.error('Email verification failed:', error);
      return { success: false, error: 'Failed to verify email' };
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      // In a real app, this would send a password reset email
      console.log(`Password reset email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, error: 'Failed to send password reset email' };
    }
  }, []);

  const resendVerificationCode = useCallback(async (email: string) => {
    try {
      const pendingData = await AsyncStorage.getItem('pending_verification');
      if (!pendingData) {
        return { success: false, error: 'No pending verification found' };
      }
      
      const pendingUser = JSON.parse(pendingData) as User;
      if (pendingUser.email !== email) {
        return { success: false, error: 'Email does not match pending verification' };
      }
      
      // Generate new verification code
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      pendingUser.verificationCode = newCode;
      
      await AsyncStorage.setItem('pending_verification', JSON.stringify(pendingUser));
      console.log(`New verification code sent to ${email}: ${newCode}`);
      
      return { success: true };
    } catch (error) {
      console.error('Resend verification failed:', error);
      return { success: false, error: 'Failed to resend verification code' };
    }
  }, []);

  return useMemo(() => ({
    ...authState,
    signUp,
    signIn,
    signOut,
    verifyEmail,
    sendPasswordReset,
    resendVerificationCode,
  }), [authState, signUp, signIn, signOut, verifyEmail, sendPasswordReset, resendVerificationCode]);
});