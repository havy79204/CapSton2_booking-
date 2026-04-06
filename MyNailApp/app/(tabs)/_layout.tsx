import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

import { HapticTab } from '@/components/common/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Feather } from '@expo/vector-icons';

export default function TabLayout() {
  const colorScheme: 'light' | 'dark' = useColorScheme() as 'light' | 'dark' || 'light';
  const router = useRouter();
  const [isAuth, setIsAuth] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  async function checkAuth() {
    try {
      const t = await AsyncStorage.getItem('@mynailapp:token')
      setIsAuth(Boolean(t))
    } catch {
      setIsAuth(false)
    } finally {
      setAuthChecked(true)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    // expose a global helper so non-component modules (api.ts) can redirect to login on 401
    try {
      // @ts-ignore
      globalThis.navigateToLogin = () => router.replace('/login')
      // expose auth change notifier so other screens can update isAuth
      // @ts-ignore
      globalThis.__notifyAuthChanged = (v: boolean) => setIsAuth(Boolean(v))
    } catch {
      // ignore
    }
    return () => {
      try {
        // @ts-ignore
        delete globalThis.navigateToLogin
        // @ts-ignore
        delete globalThis.__notifyAuthChanged
      } catch {}
    }
  }, [router])

  useEffect(() => {
    // Redirect only after initial token check is complete.
    if (authChecked && !isAuth) {
      try {
        router.replace('/login')
      } catch {
        // ignore
      }
    }
  }, [authChecked, isAuth, router])

  if (!authChecked) {
    return <View style={{ flex: 1, backgroundColor: Colors.light.background }} />
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.light.background }}>
      <LinearGradient colors={["#fb7185", "#8b5cf6"]} style={styles.headerGradient}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>NIOM&CE</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => router.push('/profile')}
              accessibilityLabel="Open profile"
            >
              <Feather name="user" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tabIconSelected,
          tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
          tabBarStyle: { backgroundColor: '#0b1220' },
          headerShown: false,
          tabBarButton: HapticTab,
        }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Lịch',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Lịch hẹn',
          tabBarIcon: ({ color }) => <MaterialIcons size={28} name="assignment" color={color} />,
        }}
      />
      <Tabs.Screen
        name="aitryon"
        options={{
          title: 'AI Try-On',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payroll"
        options={{
          title: 'Lương',
          tabBarIcon: ({ color }) => <MaterialIcons size={28} name="account-balance-wallet" color={color} />,
        }}
      />
      {/* 'staff' route is handled by file-based routing; do not declare it here to avoid duplicate screens */}
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  headerGradient: { paddingTop: 26, paddingBottom: 18, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: '#fde68a', marginTop: 4 },
  profileBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
