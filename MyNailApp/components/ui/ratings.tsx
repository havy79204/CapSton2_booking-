import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function Ratings({ items, total }: { items: { rating: string; count: number }[]; total?: number }) {
  const denom = (total ?? items.reduce((s, it) => s + it.count, 0)) || 1;

  return (
    <View style={styles.container}>
      {items.map((it, idx) => (
        <View key={idx} style={styles.row}>
          <Text style={styles.ratingLabel}>{it.rating}</Text>
          <View style={styles.barBackground}>
            <View style={[styles.barFill, { width: `${(it.count / denom) * 100}%` }]} />
          </View>
          <Text style={styles.count}>{it.count}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  ratingLabel: { width: 30, fontSize: 13, color: '#111827' },
  barBackground: { flex: 1, height: 12, backgroundColor: '#f3f4f6', borderRadius: 8, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 8 },
  count: { width: 36, textAlign: 'right', fontWeight: '700' },
});
