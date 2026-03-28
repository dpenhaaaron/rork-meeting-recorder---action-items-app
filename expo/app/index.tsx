import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, useWindowDimensions, View, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/auth-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Splash() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-width)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ensure component is mounted before starting animations
    setIsMounted(true);
    
    // Start the flowing animation
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [slideAnim, fadeAnim]);

  useEffect(() => {
    if (!isLoading && isMounted) {
      const timer = setTimeout(() => {
        try {
          console.log('Splash screen navigation:', { isAuthenticated, isLoading, isMounted });
          if (isAuthenticated) {
            router.replace('/(tabs)/home');
          } else {
            router.replace('/signin');
          }
        } catch (error) {
          console.error('Navigation error:', error);
          // Fallback navigation
          router.push('/signin');
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, isMounted]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null;
  }

  return (
    <View style={[styles.safeContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={['#F9FAFB', '#E5E7EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <Animated.View 
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateX: slideAnim }]
            }
          ]}
        >
          <Image
            source={{ uri: 'https://r2-pub.rork.com/generated-images/e3cdc382-7bf9-4b69-afc8-4afee3932219.png' }}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logo}>Convai</Text>
          <Text style={styles.tagline}>AI-Powered Meeting Intelligence</Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
});