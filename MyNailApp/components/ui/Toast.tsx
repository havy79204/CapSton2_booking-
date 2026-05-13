import React, { createContext, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';

type ToastOptions = { duration?: number };

type ToastContextType = {
  show: (message: string, opts?: ToastOptions) => void;
  showSuccess: (message: string, opts?: ToastOptions) => void;
  showError: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<number | null>(null);

  const show = (message: string, opts?: ToastOptions) => {
    setMsg(message);
    setIsError(false);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timeoutRef.current) clearTimeout(timeoutRef.current as any);
    timeoutRef.current = (setTimeout(() => hide(), opts?.duration ?? 3000) as unknown) as number;
  };

  const showSuccess = (message: string, opts?: ToastOptions) => {
    show(message, opts);
  };

  const showError = (message: string, opts?: ToastOptions) => {
    setMsg(message);
    setIsError(true);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timeoutRef.current) clearTimeout(timeoutRef.current as any);
    timeoutRef.current = (setTimeout(() => hide(), opts?.duration ?? 4000) as unknown) as number;
  };

  const hide = () => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
  };

  return (
    <ToastContext.Provider value={{ show, showSuccess, showError }}>
      {children}
      {msg ? (
        <Animated.View style={[styles.container, { opacity }]}> 
          <View style={[styles.toast, isError ? styles.error : styles.info]}>
            <Text style={styles.text}>{msg}</Text>
            <TouchableOpacity onPress={hide} style={styles.closeHit}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, top: 40, alignItems: 'center', zIndex: 9999 },
  toast: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, minWidth: 160, flexDirection: 'row', alignItems: 'center' },
  text: { color: '#fff', flex: 1 },
  info: { backgroundColor: '#111827' },
  error: { backgroundColor: '#ef4444' },
  closeHit: { marginLeft: 8 },
  closeText: { color: '#fff', fontWeight: '700' },
});

export default ToastProvider;
