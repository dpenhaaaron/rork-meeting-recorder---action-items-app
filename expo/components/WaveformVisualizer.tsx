import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface WaveformVisualizerProps {
  isRecording: boolean;
  isPaused: boolean;
  audioLevels?: number[];
}

export default function WaveformVisualizer({ isRecording, isPaused, audioLevels = [] }: WaveformVisualizerProps) {
  const animatedValues = useRef(
    Array.from({ length: 20 }, () => new Animated.Value(0.1))
  ).current;

  useEffect(() => {
    if (isRecording && !isPaused) {
      const animate = () => {
        const animations = animatedValues.map((value, index) => {
          const randomHeight = Math.random() * 0.8 + 0.2;
          return Animated.timing(value, {
            toValue: randomHeight,
            duration: 150 + Math.random() * 100,
            useNativeDriver: false,
          });
        });

        Animated.stagger(50, animations).start(() => {
          if (isRecording && !isPaused) {
            animate();
          }
        });
      };

      animate();
    } else {
      animatedValues.forEach(value => {
        Animated.timing(value, {
          toValue: 0.1,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isRecording, isPaused]);

  return (
    <View style={styles.container}>
      <View style={styles.waveform}>
        {animatedValues.map((animatedValue, index) => (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                height: animatedValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['10%', '100%'],
                }),
                backgroundColor: isPaused ? '#F59E0B' : isRecording ? '#EF4444' : '#E5E7EB',
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    minHeight: 8,
  },
});