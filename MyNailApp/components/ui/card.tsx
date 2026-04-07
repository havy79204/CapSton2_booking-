import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';

type Props = ViewProps & {
  children?: React.ReactNode;
};

export default function Card({ children, style, ...rest }: Props) {
  // Use boxShadow on web (react-native-web) because shadow* props are deprecated there.
  const webShadow = Platform.OS === 'web' ? { boxShadow: '0 8px 20px rgba(0,0,0,0.08)' } : {};
  const nativeShadow =
    Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        };

  return (
    <View style={[styles.card, nativeShadow, webShadow, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 3,
  },
});
