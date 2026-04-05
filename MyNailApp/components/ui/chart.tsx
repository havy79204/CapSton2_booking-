import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

type BarData = { label: string; value: number };

function formatAxisValue(value: number) {
  const n = Number(value || 0);
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

export function BarChart({ data, height = 120 }: { data: BarData[]; height?: number }) {
  const safeData = Array.isArray(data) ? data : [];
  const max = Math.max(...safeData.map((d) => Number(d.value || 0)), 1);
  const chartHeight = Math.max(64, height - 24);
  const yTicks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <View style={[styles.barRoot, { height }]}>
      <View style={[styles.yAxis, { height: chartHeight }]}>
        {yTicks.map((tick) => (
          <Text key={`tick-${tick}`} style={styles.yAxisLabel}>{formatAxisValue(max * tick)}</Text>
        ))}
      </View>

      <View style={styles.barMain}>
        <View style={styles.barPlot}>
          <View style={[styles.gridLayer, { height: chartHeight }]}>
            {yTicks.map((tick) => (
              <View
                key={`grid-${tick}`}
                style={[styles.gridLine, { top: `${(1 - tick) * 100}%` }]}
              />
            ))}
          </View>

          <View style={[styles.barContainer, { height: chartHeight }]}>
            {safeData.map((d, i) => (
              <View key={i} style={styles.barColumn}>
                <View style={[styles.bar, { height: Math.max(4, (Number(d.value || 0) / max) * chartHeight) }]} />
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

export function DonutLegend({ items }: { items: { label: string; value: number; color: string }[] }) {
  const safeItems = (items || []).filter((x) => Number(x.value || 0) > 0);
  const total = safeItems.reduce((sum, x) => sum + Number(x.value || 0), 0);
  const size = 96;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let runningRatio = 0;
  return (
    <View style={styles.legendContainer}>
      <View style={styles.donutWrap}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#f3f4f6"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {safeItems.map((item, idx) => {
              const ratio = total > 0 ? Number(item.value || 0) / total : 0;
              const dash = ratio * circumference;
              const gap = circumference - dash;
              const offset = -runningRatio * circumference;
              runningRatio += ratio;
              return (
                <Circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt"
                  fill="none"
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </G>
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={styles.donutCenterValue}>{Math.round(total)}%</Text>
        </View>
      </View>
      <View style={styles.legendItems}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
            <Text style={styles.legendValue}>{item.value}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  barRoot: {
    width: '100%',
    flexDirection: 'row',
  },
  yAxis: {
    width: 36,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingTop: 2,
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  barMain: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  barPlot: {
    position: 'relative',
    marginLeft: 8,
  },
  gridLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  bar: {
    width: 14,
    backgroundColor: '#f472b6',
    borderRadius: 8,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  donutWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutCenterValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  legendItems: { flex: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, marginRight: 8 },
  legendLabel: { flex: 1, color: '#374151' },
  legendValue: { color: '#111827', fontWeight: '700' },
});

export default {
  BarChart,
  DonutLegend,
};
