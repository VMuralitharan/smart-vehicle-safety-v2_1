import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ActionButton, Card, Field, Heading } from '../components/UI';
import { colors as c } from '../components/theme';
import { saveProfile } from '../lib/database';
import type { Role } from '../lib/types';

export function RoleSetupScreen({ uid, email, initialName, onLogout, logoutBusy }: { uid: string; email: string; initialName: string; onLogout: () => void; logoutBusy: boolean }) {
  // Covers old accounts that were created without a role, or an interrupted registration.
  // Never preselect Owner (the bug that previously forced bus registration).
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!role) { Alert.alert('Choose account type', 'Select Passenger or Owner / Manager.'); return; }
    if (name.trim().length < 2) { Alert.alert('Enter your name'); return; }
    setBusy(true);
    try { await saveProfile(uid, { name: name.trim(), email, role }); }
    catch (e: any) { Alert.alert('Unable to finish setup', e?.message || 'Could not save account.'); }
    finally { setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: c.background, padding: 20, justifyContent: 'center' }}>
    <Heading title="Choose your account type" subtitle="This account has no saved role. Your choice determines the next screen." />
    <Card>
      <Field label="Full name" value={name} onChangeText={setName} />
      <ActionButton title={role === 'passenger' ? '✓ Passenger — join a bus' : 'Passenger — join a bus'}
        onPress={() => setRole('passenger')} variant={role === 'passenger' ? 'primary' : 'secondary'} />
      <ActionButton title={role === 'owner' ? '✓ Owner / Manager — register a bus' : 'Owner / Manager — register a bus'}
        onPress={() => setRole('owner')} variant={role === 'owner' ? 'primary' : 'secondary'} />
      <Text style={{ color: c.muted, marginVertical: 12, fontSize: 12 }}>Passenger accounts never need to register a vehicle. If your previous account has registered buses, select Owner / Manager.</Text>
      <ActionButton title={busy ? 'Saving…' : 'Continue'} disabled={busy || !role} onPress={save} />
      <ActionButton title={logoutBusy ? 'Logging out…' : 'Logout'} variant="secondary" disabled={busy || logoutBusy} onPress={onLogout} />
    </Card>
  </View>;
}
