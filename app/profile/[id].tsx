import { useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ユーザープロフィール</Text>
      <Text>ID: {id}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
})