import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/auth-store';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const slideAnim = useRef(new Animated.Value(-width)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start the flowing animation
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
  }, [slideAnim, fadeAnim]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        try {
          console.log('Splash screen navigation:', { isAuthenticated, isLoading });
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
      }, 2000); // Reduced from 3000 to 2000

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading]);

  return (
    <LinearGradient
      colors={['#FF6B6B', '#FF8E53', '#FF6B35']}
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
        <Text style={styles.logo}>Convai</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 72,
    fontWeight: '300',
    color: '#FFFFFF',
    fontStyle: 'italic',
    letterSpacing: 4,
    textAlign: 'center',
    fontFamily: 'System',
  },
});