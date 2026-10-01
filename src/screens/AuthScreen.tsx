import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { saveProfile } from '../lib/database';
import { ActionButton, Card, Field } from '../components/UI';
import { brandGradient, colors as c } from '../components/theme';
import type { Role } from '../lib/types';

type Mode = 'login' | 'chooseRole' | 'register' | 'reset';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  // An account type must be selected explicitly. Never silently default to Owner.
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectRole = (selected: Role) => {
    setRole(selected);
    setError('');
    setMode('register');
  };

  const submit = async () => {
    if (!auth || (mode !== 'login' && mode !== 'register' && mode !== 'reset')) return;
    setError('');
    if (!email.trim().includes('@')) { setError('Enter a valid email address.'); return; }
    if (mode === 'register' && !role) { setError('Please select an account type first.'); setMode('chooseRole'); return; }
    if (mode === 'register' && name.trim().length < 2) { setError('Enter your full name.'); return; }
    if (mode !== 'reset' && password.length < 6) { setError('Password must contain at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        Alert.alert('Check email', 'A password reset message was requested.');
        setMode('login');
      } else if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        // User authentication may become active before their Firebase profile write completes.
        // The app must wait for a profile WITH an explicit role before choosing a dashboard.
        const selectedRole = role!;
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(result.user, { displayName: name.trim() });
        await saveProfile(result.user.uid, { name: name.trim(), email: email.trim(), role: selectedRole });
      }
    } catch (e: any) {
      setError(e?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.plum }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:1}} style={{position:'absolute',top:0,right:0,bottom:0,left:0}} />
    <View style={{position:'absolute',width:180,height:180,borderRadius:90,backgroundColor:'rgba(255,255,255,0.08)',top:-70,right:-55}} />
    <View style={{position:'absolute',width:120,height:120,borderRadius:60,backgroundColor:'rgba(255,255,255,0.07)',bottom:45,left:-55}} />
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 34 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderWidth:1,borderColor:'rgba(255,255,255,0.32)', width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ color: 'white', fontSize: 34 }}>▣</Text>
        </View>
        <Text style={{ fontSize: 29, color: c.white, fontWeight: '900', textAlign: 'center',letterSpacing:-0.5 }}>Smart Vehicle Safety</Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 7 }}>Monitor · Detect · Respond</Text>
      </View>
      <Card style={{borderRadius:32,paddingHorizontal:22,paddingVertical:24,borderColor:'rgba(255,255,255,0.55)',shadowOpacity:0.22,shadowRadius:22,elevation:8}}>
        {mode === 'chooseRole' ? <>
          <Text style={{ fontWeight: '900', fontSize: 20, color: c.navy, marginBottom: 7 }}>How will you use this app?</Text>
          <Text style={{ color: c.muted, marginBottom: 15 }}>Choose your role BEFORE creating your account.</Text>
          <Pressable testID="choose-passenger" onPress={() => selectRole('passenger')}
            style={{ backgroundColor: c.bluePale, borderColor: c.blue, borderWidth: 2, borderRadius: 14, padding: 18, marginBottom: 12 }}>
            <Text style={{ color: c.navy, fontSize: 19, fontWeight: '900' }}>Passenger</Text>
            <Text style={{ color: c.muted, marginTop: 5 }}>Join an existing bus by QR code / bus code. You do NOT register a vehicle.</Text>
          </Pressable>
          <Pressable testID="choose-owner" onPress={() => selectRole('owner')}
            style={{ backgroundColor: c.white, borderColor: c.border, borderWidth: 2, borderRadius: 14, padding: 18, marginBottom: 8 }}>
            <Text style={{ color: c.navy, fontSize: 19, fontWeight: '900' }}>Owner / Manager</Text>
            <Text style={{ color: c.muted, marginTop: 5 }}>Register or manage buses and approve passenger requests.</Text>
          </Pressable>
          {error ? <Text style={{ color: c.red, marginVertical: 8 }}>{error}</Text> : null}
          <ActionButton variant="secondary" title="Back to sign in" onPress={() => { setRole(null); setError(''); setMode('login'); }} />
        </> : <>
          <Text style={{ fontWeight: '900', fontSize: 19, color: c.navy, marginBottom: 14 }}>
            {mode === 'login' ? 'Welcome back' : mode === 'reset' ? 'Reset password' : `Create ${role === 'passenger' ? 'Passenger' : 'Owner / Manager'} account`}
          </Text>
          {mode === 'register' ? <>
            <View style={{ backgroundColor: c.bluePale, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: c.navy, fontWeight: '800' }}>Selected account: {role === 'passenger' ? 'Passenger' : 'Owner / Manager'}</Text>
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{role === 'passenger' ? 'Next screen: Join your bus (no vehicle registration).' : 'Next screen: Register or import your vehicle.'}</Text>
            </View>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          </> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
          {mode !== 'reset' ? <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoCapitalize="none" /> : null}
          {error ? <Text style={{ color: c.red, marginBottom: 10 }}>{error}</Text> : null}
          <ActionButton title={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset email'} disabled={busy} onPress={submit} />
          {mode === 'register' ? <ActionButton variant="secondary" title="Change account type" disabled={busy} onPress={() => { setRole(null); setError(''); setMode('chooseRole'); }} /> : null}
          <ActionButton variant="secondary" title={mode === 'login' ? 'Create an account' : 'Back to sign in'} disabled={busy}
            onPress={() => { setError(''); if (mode === 'login') { setRole(null); setMode('chooseRole'); } else { setRole(null); setMode('login'); } }} />
          {mode === 'login' ? <Text style={{ textAlign: 'center', color: c.blue, fontWeight: '800', marginTop: 14 }} onPress={() => { setError(''); setMode('reset'); }}>Forgot password?</Text> : null}
        </>}
      </Card>
    </ScrollView>
  </KeyboardAvoidingView>;
}
