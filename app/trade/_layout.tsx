// app/trade/_layout.tsx
import { Stack } from 'expo-router'
import React from 'react'

export default function TradeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  )
}