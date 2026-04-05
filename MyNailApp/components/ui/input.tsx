import React from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export default function Input({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput style={[styles.input, style]} {...rest} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginVertical: 6,
  },
  label: {
    marginBottom: 6,
    fontSize: 12,
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e6eef8',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  error: {
    color: '#ef4444',
    marginTop: 6,
    fontSize: 12,
  },
});
