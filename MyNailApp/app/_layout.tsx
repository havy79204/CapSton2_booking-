import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { lightTheme } from '@/constants/theme';
import { ToastProvider } from '@/components/ui/Toast';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  // Force light theme to keep UI consistent with design screenshots.
  // If you want to respect system settings, revert this to: const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={lightTheme}>
      <ToastProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ToastProvider>
    </ThemeProvider>
  );
}
