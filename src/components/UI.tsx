import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, colors as c } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={{ marginBottom: 17 }}>
    <Text style={styles.h1}>{title}</Text>
    {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
  </View>;
}
export function SmallLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Field({ label, value, onChangeText, placeholder, secureTextEntry,
  keyboardType, multiline, autoCapitalize }: {
  label: string; value: string; onChangeText: (value: string) => void;
  placeholder?: string; secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions; multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return <View style={{ marginBottom: 13 }}>
    <SmallLabel>{label}</SmallLabel>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor="#94A3B8" secureTextEntry={secureTextEntry}
      keyboardType={keyboardType} multiline={multiline} autoCapitalize={autoCapitalize}
      style={[styles.input, multiline ? { minHeight: 80, textAlignVertical: 'top' } : null]} />
  </View>;
}
export function ActionButton({ title, onPress, disabled, variant = 'primary' }: {
  title: string; onPress: () => void; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return <Pressable onPress={onPress} disabled={disabled}
    style={[styles.button, variant === 'secondary' && styles.secondary,
      variant === 'danger' && styles.danger, disabled && { opacity: 0.55 }]}> 
    {variant === 'primary' ? <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill}/> : null}
    <Text style={[styles.buttonText, variant === 'secondary' && { color: c.blue }]}>{title}</Text>
  </Pressable>;
}
export function Info({ text }: { text: string }) {
  return <Card><Text style={styles.muted}>{text}</Text></Card>;
}
export function Loading() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" color={c.blue} />
  </View>;
}
export const styles = StyleSheet.create({
  card: { backgroundColor: c.white, borderRadius: 24, padding: 19, marginBottom: 14,
    borderWidth: 1, borderColor: c.border, shadowColor: c.plum, shadowOpacity: 0.09,
    shadowRadius: 14, shadowOffset: {width:0,height:6}, elevation: 3 },
  h1: { fontSize: 27, fontWeight: '900', color: c.navy, marginBottom: 5, letterSpacing: -0.4 },
  muted: { color: c.muted, fontSize: 13, lineHeight: 19 },
  label: { color: c.blue, fontWeight: '800', marginBottom: 3, fontSize: 13 },
  input: { borderWidth: 0, borderBottomWidth: 1.5, borderColor: c.border, borderRadius: 0,
    paddingHorizontal: 0, paddingVertical: 10, fontSize: 15, color: c.text,
    backgroundColor: c.white },
  button: { backgroundColor: c.blue, borderRadius: 24, paddingVertical: 14,
    paddingHorizontal: 18, alignItems: 'center', marginTop: 7, overflow: 'hidden' },
  buttonText: { color: c.white, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  secondary: { backgroundColor: c.bluePale, borderWidth: 1, borderColor: '#F2CCD6' },
  danger: { backgroundColor: c.red },
});
