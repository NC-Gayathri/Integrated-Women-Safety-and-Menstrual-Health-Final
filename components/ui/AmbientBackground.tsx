// components/ui/AmbientBackground.tsx
import React from 'react';
import { View, StyleSheet, Dimensions, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface AmbientBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
}

export function AmbientBackground({
  children,
  style,
  accentColor = '#E8DDFA',
}: AmbientBackgroundProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Top Header Organic Ambient Glow (4-8% Opacity) */}
      <View style={styles.ambientHeaderContainer} pointerEvents="none">
        <LinearGradient
          colors={[accentColor, 'rgba(252, 228, 236, 0.5)', 'transparent']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.ambientLayerPrimary}
        />
        <LinearGradient
          colors={['rgba(244, 239, 251, 0.8)', 'rgba(248, 250, 252, 0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.ambientLayerSecondary}
        />
      </View>

      {/* Main Content View */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  ambientHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    overflow: 'hidden',
    zIndex: 0,
  },
  ambientLayerPrimary: {
    position: 'absolute',
    top: -60,
    left: -width * 0.25,
    width: width * 1.5,
    height: 260,
    borderRadius: 180,
    opacity: 0.08,
    transform: [{ scaleX: 1.4 }],
  },
  ambientLayerSecondary: {
    position: 'absolute',
    top: -20,
    right: -width * 0.2,
    width: width * 1.2,
    height: 200,
    borderRadius: 140,
    opacity: 0.06,
  },
});
