import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, Component, ReactNode, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { RecordingProvider } from "@/hooks/recording-store";
import { AuthProvider } from "@/hooks/auth-store";
import { trpc, trpcClient } from "@/lib/trpc";

SplashScreen.preventAutoHideAsync();

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error('Error Boundary - getDerivedStateFromError:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('App Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorBoundary: errorInfo.errorBoundary,
      errorBoundaryStack: errorInfo.errorBoundaryStack
    });
    
    // Log additional context for debugging
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      timestamp: new Date().toISOString()
    });
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Unknown error occurred';
      const isRecordingError = errorMessage.toLowerCase().includes('recording') || 
                              errorMessage.toLowerCase().includes('audio') ||
                              errorMessage.toLowerCase().includes('microphone');
      
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            {isRecordingError 
              ? 'There was an issue with audio recording. Please check your microphone permissions and try again.'
              : 'The app encountered an unexpected error. Please restart the app.'}
          </Text>
          {__DEV__ && (
            <Text style={errorStyles.debugText}>
              Error: {errorMessage}
            </Text>
          )}
          <TouchableOpacity 
            style={errorStyles.button}
            onPress={() => {
              console.log('User pressed Try Again button');
              this.setState({ hasError: false, error: undefined });
            }}
          >
            <Text style={errorStyles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  debugText: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'monospace',
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 4,
  },
  button: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

const rootStyles = StyleSheet.create({
  gestureHandler: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  hydrationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  hydrationText: {
    fontSize: 16,
    color: '#FF8C00',
    fontWeight: 'bold',
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="signin" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}

function HydrationWrapper({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Ensure hydration is complete before rendering
    const timer = setTimeout(() => {
      setIsHydrated(true);
    }, 50);
    
    return () => clearTimeout(timer);
  }, []);

  if (!isHydrated) {
    return (
      <View style={styles.hydrationContainer}>
        <Text style={styles.hydrationText}>Loading...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    console.log('RootLayout mounted - App is starting');
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(console.warn);
    }, 100);
    
    // Global error handlers for unhandled promise rejections and errors
    const handleUnhandledRejection = (event: any) => {
      console.error('Unhandled Promise Rejection:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString()
      });
      
      // Prevent the default behavior (which would crash the app)
      event.preventDefault();
    };
    
    const handleError = (event: any) => {
      console.error('Global Error Handler:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        timestamp: new Date().toISOString()
      });
    };
    
    // Add global error listeners (web only)
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      window.addEventListener('error', handleError);
    }
    
    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        window.removeEventListener('error', handleError);
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <HydrationWrapper>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RecordingProvider>
                <GestureHandlerRootView style={rootStyles.gestureHandler}>
                  <RootLayoutNav />
                </GestureHandlerRootView>
              </RecordingProvider>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </HydrationWrapper>
    </ErrorBoundary>
  );
}