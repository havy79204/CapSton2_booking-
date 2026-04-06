import React, { useState } from 'react';
import { View, StyleSheet, Text, LayoutChangeEvent } from 'react-native';

type Point = { label: string; value: number };

export default function LineChart({ data, height = 160 }: { data: Point[]; height?: number }) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => {
    const x = width ? (i / Math.max(1, data.length - 1)) * width : 0;
    const y = height - (d.value / max) * (height - 24) - 12; // leave padding
    return { x, y };
  });

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {/* Y axis labels */}
      <View style={styles.yAxis}>
        {[0, 1 / 4, 2 / 4, 3 / 4, 1].map((t, idx) => (
          <Text key={idx} style={styles.yLabel}>
            {Math.round(max * t)}
          </Text>
        ))}
      </View>

      <View style={[styles.chartArea, { pointerEvents: 'none' }]}>
        {/* grid horizontal lines */}
        {[0, 1 / 4, 2 / 4, 3 / 4, 1].map((t, idx) => (
          <View key={idx} style={[styles.gridLine, { top: t * (height - 24) }]} />
        ))}

        {/* connecting lines */}
        {points.map((p, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          return (
            <View
              key={`seg-${i}`}
              style={[
                styles.segment,
                {
                  left: prev.x,
                  top: prev.y,
                  width: length,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}

        {/* points */}
        {points.map((p, i) => (
          <View key={i} style={[styles.dot, { left: p.x - 6, top: p.y - 6 }]} />
        ))}
      </View>

      {/* X labels */}
      <View style={styles.xLabels}>
        {data.map((d, i) => (
          <Text key={i} style={styles.xLabel}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'row', padding: 8 },
  yAxis: { width: 48, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 8 },
  yLabel: { fontSize: 10, color: '#6b7280' },
  chartArea: { flex: 1, position: 'relative', height: '100%' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#f3f4f6' },
  segment: { position: 'absolute', height: 2, backgroundColor: '#ec4899', borderRadius: 2, transformOrigin: 'left top' as any },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#ec4899', borderWidth: 2, borderColor: '#fff' },
  xLabels: { position: 'absolute', left: 56, right: 8, bottom: 4, flexDirection: 'row', justifyContent: 'space-between' },
  xLabel: { fontSize: 12, color: '#6b7280' },
});
