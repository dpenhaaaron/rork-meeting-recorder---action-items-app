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
  passwordHash?: string;
  resetToken?: string;
  resetTokenExpiry?: string;
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
  const [isHydrated, setIsHydrated] = useState(false);

  // All useCallback hooks defined in consistent order
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

  const signUp = useCallback(async (email: string, fullName: string, location: string, password: string, locationCoords?: { latitude: number; longitude: number }) => {
    try {
      // Check if user already exists
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const existingUser = userData.find(([key, value]) => {
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
      
      if (existingUser) {
        return { success: false, error: 'An account with this email already exists' };
      }

      const isAdmin = email.toLowerCase() === 'admin@convai.com';
      // Simple password hashing (in production, use bcrypt)
      const passwordHash = btoa(password + 'salt_convai_2024');
      
      const user: User = {
        id: Date.now().toString(),
        email,
        fullName,
        location,
        locationCoords,
        createdAt: new Date().toISOString(),
        isEmailVerified: true, // No email verification needed
        isAdmin,
        passwordHash,
      };

      await AsyncStorage.setItem(`user_${user.id}`, JSON.stringify(user));
      
      console.log(`Account created for ${email}`);
      
      return { success: true };
    } catch (error) {
      console.error('Sign up failed:', error);
      return { success: false, error: 'Failed to create account' };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      // Handle admin account
      if (email.toLowerCase() === 'admin@convai.com' && password === 'Timothyruthelel1@') {
        const adminUser: User = {
          id: 'admin_001',
          email: 'admin@convai.com',
          fullName: 'Admin User',
          location: 'System',
          createdAt: new Date().toISOString(),
          isEmailVerified: true,
          isAdmin: true,
          passwordHash: btoa('Timothyruthelel1@' + 'salt_convai_2024'),
        };
        
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(adminUser));
        
        setAuthState({
          user: adminUser,
          isLoading: false,
          isAuthenticated: true,
        });
        return { success: true };
      }

      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const foundUser = userData.find(([key, value]) => {
        if (value) {
          try {
            const user = JSON.parse(value);
            const expectedHash = btoa(password + 'salt_convai_2024');
            return user.email === email && user.passwordHash === expectedHash;
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
      
      return { success: false, error: 'Invalid email or password' };
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

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
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
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
        
        const updatedUser = {
          ...user,
          resetToken,
          resetTokenExpiry,
        };
        
        await AsyncStorage.setItem(`user_${user.id}`, JSON.stringify(updatedUser));
        
        console.log(`Password reset link sent to ${email}`);
        console.log(`Reset token: ${resetToken}`);
        
        return { success: true, resetToken };
      }
      
      return { success: false, error: 'No account found with this email address' };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, error: 'Failed to send password reset email' };
    }
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const foundUser = userData.find(([key, value]) => {
        if (value) {
          try {
            const user = JSON.parse(value);
            return user.resetToken === token && new Date(user.resetTokenExpiry) > new Date();
          } catch {
            return false;
          }
        }
        return false;
      });
      
      if (foundUser && foundUser[1]) {
        const user = JSON.parse(foundUser[1]);
        const newPasswordHash = btoa(newPassword + 'salt_convai_2024');
        
        const updatedUser = {
          ...user,
          passwordHash: newPasswordHash,
          resetToken: undefined,
          resetTokenExpiry: undefined,
        };
        
        await AsyncStorage.setItem(`user_${user.id}`, JSON.stringify(updatedUser));
        
        return { success: true };
      }
      
      return { success: false, error: 'Invalid or expired reset token' };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }, []);

  const getAllUsers = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const users = userData
        .map(([key, value]) => {
          if (value) {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        })
        .filter(Boolean);
      
      return users;
    } catch (error) {
      console.error('Failed to get users:', error);
      return [];
    }
  }, []);

  // useEffect hook - always after all useCallback hooks
  useEffect(() => {
    console.log('AuthProvider: Loading stored auth...');
    const timer = setTimeout(() => {
      setIsHydrated(true);
      loadStoredAuth();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadStoredAuth]);

  const contextValue = useMemo(() => ({
    ...authState,
    isLoading: authState.isLoading || !isHydrated,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    resetPassword,
    getAllUsers,
  }), [
    authState,
    isHydrated,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    resetPassword,
    getAllUsers,
  ]);

  return contextValue;
});