import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'

type NoticeType = 'success' | 'error'

type NoticeProps = {
  type: NoticeType
  message: string
  style?: ViewStyle
}

export default function Notice({ type, message, style }: NoticeProps) {
  if (!message) return null

  return (
    <View style={[styles.notice, type === 'success' ? styles.noticeSuccess : styles.noticeError, style]}>
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noticeSuccess: {
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  noticeError: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  noticeText: {
    color: '#1f2937',
    fontWeight: '600',
  },
})
