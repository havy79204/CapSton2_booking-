import { Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

// Fonts per platform
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'System',
    serif: 'serif',
    rounded: 'System',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

const defaultRegular = {
  fontFamily: Platform.select({ web: (Fonts as any)?.web?.sans ?? 'system-ui', default: (Fonts as any)?.default?.sans ?? 'System' }),
  fontWeight: '400',
};
const defaultMedium = {
  fontFamily: Platform.select({ web: (Fonts as any)?.web?.rounded ?? 'system-ui', default: (Fonts as any)?.default?.rounded ?? 'System' }),
  fontWeight: '500',
};

export const navigationFonts = {
  regular: defaultRegular,
  medium: defaultMedium,
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    primary: '#0ea5e9',
    background: '#ffffff',
    card: '#f8fafc',
    text: '#0f172a',
    border: '#e6eef8',
    notification: '#ef4444',
  },
  // provide fonts so react-navigation components can use fonts.regular / fonts.medium
  fonts: navigationFonts as any,
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    primary: '#60a5fa',
    background: '#0b1220',
    card: '#0f1724',
    text: '#e6eef8',
    border: '#1f2937',
    notification: '#fb7185',
  },
  fonts: navigationFonts as any,
};

export default lightTheme;

// Additional app colors
const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};
