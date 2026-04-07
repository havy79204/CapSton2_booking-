import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type Props = {
  value?: string | number;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function Badge({ value, style, textStyle }: Props) {
  if (value == null) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={[styles.text, textStyle]}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
