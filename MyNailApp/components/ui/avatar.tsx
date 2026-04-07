import React from 'react';
import { View, Image, Text, StyleSheet, ImageProps } from 'react-native';

type Props = ImageProps & {
  size?: number;
  initials?: string;
  uri?: string;
};

export default function Avatar({ size = 40, initials, uri, style, ...rest }: Props) {
  if (uri) {
    return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} {...rest} />;
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={styles.text}>{initials ? initials : 'U'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e6f2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#0369a1',
    fontWeight: '700',
  },
});
