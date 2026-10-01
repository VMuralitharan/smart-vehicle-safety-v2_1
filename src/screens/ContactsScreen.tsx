
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  ActionButton,
  Card,
  Field,
  Heading,
  Info,
  SmallLabel,
} from '../components/UI';
import { colors as c } from '../components/theme';
import {
  createSmsTestRequest,
  deleteContact,
  devicePath,
  saveContact,
  saveSmsModeConfig,
  saveSmsTemplate,
  watchContacts,
  watchSmsDispatchHistory,
  watchSmsDispatchStatus,
  watchSmsModeConfig,
  watchSmsTemplates,
  watchValue,
} from '../lib/database';
import {
  DEFAULT_SMS_MODE_CONFIG,
  DEFAULT_SMS_TEMPLATES,
  normalizeSmsPhone,
  renderSmsTemplate,
  SMS_EVENT_LABELS,
  SMS_TEMPLATE_MAX_LENGTH,
  validateSmsTemplate,
  type SmsEventType,
} from '../lib/sms';
import type {
  EmergencyContact,
  SmsDispatchHistoryItem,
  SmsDispatchStatus,
  SmsModeConfig,
  SmsTemplates,
  Vehicle,
  VehicleLocation,
} from '../lib/types';

const EVENT_TYPES: SmsEventType[] = [
  'accident',
  'drowsiness',
  'emergencyButton',
];

const enabledFor = (
  contact: EmergencyContact,
  type: SmsEventType
) =>
  contact.smsEnabled === true &&
  contact.allowTestSms === true &&
  (type === 'accident'
    ? contact.notifyAccident === true
    : type === 'drowsiness'
    ? contact.notifyDrowsiness === true
    : contact.notifyEmergencyButton === true);

function Toggle({
  title,
  value,
  onPress,
}: {
  title: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <ActionButton
      title={`${value ? '[ON] ' : '[OFF] '}${title}`}
      variant={value ? 'primary' : 'secondary'}
      onPress={onPress}
    />
  );
}

function ExpandableHeader({
  title,
  subtitle,
  expanded,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 3,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            color: c.navy,
            fontWeight: '900',
            fontSize: 17,
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            color: c.muted,
            fontSize: 12,
            marginTop: 3,
          }}
        >
          {subtitle}
        </Text>
      </View>

      <Text
        style={{
          color: c.blue,
          fontWeight: '900',
          fontSize: 25,
        }}
      >
        {expanded ? '−' : '+'}
      </Text>
    </Pressable>
  );
}

function TemplateEditor({
  vehicleId,
  type,
  saved,
  previewData,
}: {
  vehicleId: string;
  type: SmsEventType;
  saved: string;
  previewData: Parameters<typeof renderSmsTemplate>[1];
}) {
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setValue(saved), [vehicleId, saved]);
  useEffect(() => setExpanded(false), [vehicleId]);

  const validation = validateSmsTemplate(value);
  const dirty = value.trim() !== saved.trim();

  const save = async (template: string, success: string) => {
    const issue = validateSmsTemplate(template);

    if (issue) {
      Alert.alert('Check message template', issue);
      return;
    }

    setBusy(true);

    try {
      await saveSmsTemplate(vehicleId, type, template);
      setValue(template);
      setExpanded(false);
      Alert.alert('Saved', success);
    } catch (e: any) {
      Alert.alert(
        'Unable to save template',
        e?.message || 'Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ExpandableHeader
        testID={`toggle-sms-template-${type}`}
        title={SMS_EVENT_LABELS[type]}
        subtitle={
          expanded
            ? 'Tap to shrink template editor'
            : 'Tap to edit this message template'
        }
        expanded={expanded}
        onPress={() => {
          if (!busy) setExpanded(current => !current);
        }}
      />

      {expanded ? (
        <View style={{ marginTop: 14 }}>
          <Text
            style={{
              color: c.muted,
              fontSize: 12,
              marginTop: 5,
            }}
          >
            Supported: {'{vehicleName}'}, {'{plateNumber}'},{' '}
            {'{eventType}'}, {'{eventTime}'}, {'{impactG}'},{' '}
            {'{locationUrl}'}
          </Text>

          <View style={{ marginTop: 10 }}>
            <Field
              label="Message template"
              value={value}
              onChangeText={setValue}
              multiline
            />
          </View>

          <Text
            style={{
              color:
                value.length > SMS_TEMPLATE_MAX_LENGTH
                  ? c.red
                  : c.muted,
              fontSize: 12,
              textAlign: 'right',
            }}
          >
            {value.length}/{SMS_TEMPLATE_MAX_LENGTH}
          </Text>

          {validation ? (
            <Text
              style={{
                color: c.red,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              {validation}
            </Text>
          ) : null}

          <SmallLabel>Preview</SmallLabel>

          <Text
            selectable
            style={{
              color: c.text,
              backgroundColor: c.background,
              borderRadius: 12,
              padding: 12,
              lineHeight: 19,
            }}
          >
            {validation
              ? 'Fix the template to preview it.'
              : renderSmsTemplate(value, previewData)}
          </Text>

          <ActionButton
            title={busy ? 'Saving...' : 'Save template'}
            disabled={busy || Boolean(validation) || !dirty}
            onPress={() =>
              save(
                value,
                `${SMS_EVENT_LABELS[type]} updated.`
              )
            }
          />

          <ActionButton
            title="Restore Default"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                'Restore default template?',
                `This replaces the saved ${SMS_EVENT_LABELS[
                  type
                ].toLowerCase()}.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Restore',
                    onPress: () =>
                      save(
                        DEFAULT_SMS_TEMPLATES[type],
                        `${SMS_EVENT_LABELS[type]} restored.`
                      ),
                  },
                ]
              )
            }
          />

          <ActionButton
            title="Collapse template"
            variant="secondary"
            disabled={busy}
            onPress={() => setExpanded(false)}
          />
        </View>
      ) : null}
    </Card>
  );
}

export function ContactsScreen({
  vehicle,
}: {
  vehicle: Vehicle;
}) {
  const [items, setItems] = useState<EmergencyContact[]>([]);
  const [templates, setTemplates] = useState<SmsTemplates>({});
  const [location, setLocation] =
    useState<VehicleLocation | null>(null);

  const [modeConfig, setModeConfig] =
    useState<SmsModeConfig>(DEFAULT_SMS_MODE_CONFIG);

  const [history, setHistory] =
    useState<SmsDispatchHistoryItem[]>([]);

  const [modeBusy, setModeBusy] = useState(false);
  const [globalAccident, setGlobalAccident] = useState(false);
  const [globalDrowsiness, setGlobalDrowsiness] =
    useState(false);
  const [globalEmergency, setGlobalEmergency] =
    useState(false);

  const [id, setId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');

  const [smsEnabled, setSmsEnabled] = useState(false);
  const [allowTestSms, setAllowTestSms] = useState(false);
  const [notifyAccident, setNotifyAccident] = useState(false);
  const [notifyDrowsiness, setNotifyDrowsiness] =
    useState(false);
  const [notifyEmergencyButton, setNotifyEmergencyButton] =
    useState(false);

  const [contactBusy, setContactBusy] = useState(false);
  const [testRequestBusy, setTestRequestBusy] =
    useState(false);

  const testRequestLock = useRef(false);

  const [error, setError] = useState('');
  const [testContactId, setTestContactId] = useState('');
  const [testEvent, setTestEvent] =
    useState<SmsEventType>('accident');

  const [testRequestId, setTestRequestId] = useState('');
  const [testStatus, setTestStatus] =
    useState<SmsDispatchStatus | null>(null);
  const [testError, setTestError] = useState('');

  const [contactFormOpen, setContactFormOpen] =
    useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [expandedContactId, setExpandedContactId] =
    useState<string | null>(null);

  const reset = () => {
    setId(undefined);
    setName('');
    setPhone('');
    setRelation('');
    setSmsEnabled(false);
    setAllowTestSms(false);
    setNotifyAccident(false);
    setNotifyDrowsiness(false);
    setNotifyEmergencyButton(false);
  };

  const closeContactForm = () => {
    if (contactBusy) return;
    reset();
    setContactFormOpen(false);
  };

  const toggleContactForm = () => {
    if (contactBusy) return;

    if (contactFormOpen) {
      closeContactForm();
    } else {
      reset();
      setContactFormOpen(true);
    }
  };

  useEffect(() => {
    setItems([]);
    setTemplates({});
    setLocation(null);
    setHistory([]);
    setModeConfig(DEFAULT_SMS_MODE_CONFIG);
    setError('');
    setTestContactId('');
    setTestRequestId('');
    setTestStatus(null);
    reset();
    setContactFormOpen(false);
    setModeOpen(false);
    setExpandedContactId(null);

    const a = watchContacts(vehicle.id, setItems, setError);
    const b = watchSmsTemplates(
      vehicle.id,
      setTemplates,
      setError
    );
    const d = watchValue<VehicleLocation>(
      `${devicePath(vehicle.id)}/location`,
      setLocation,
      setError
    );
    const e = watchSmsModeConfig(
      vehicle.id,
      value =>
        setModeConfig(value || DEFAULT_SMS_MODE_CONFIG),
      setError
    );
    const f = watchSmsDispatchHistory(
      vehicle.id,
      setHistory,
      setError
    );

    return () => {
      a();
      b();
      d();
      e();
      f();
    };
  }, [vehicle.id]);

  useEffect(() => {
    setGlobalAccident(modeConfig.notifyAccident);
    setGlobalDrowsiness(modeConfig.notifyDrowsiness);
    setGlobalEmergency(modeConfig.notifyEmergencyButton);
  }, [modeConfig]);

  useEffect(() => {
    if (!testRequestId || !testContactId) return;

    setTestStatus(null);
    setTestError('');

    return watchSmsDispatchStatus(
      vehicle.id,
      testRequestId,
      testContactId,
      setTestStatus,
      setTestError
    );
  }, [vehicle.id, testRequestId, testContactId]);

  const save = async () => {
    const normalized = normalizeSmsPhone(phone);

    if (name.trim().length < 2 || !normalized) {
      Alert.alert(
        'Check details',
        'Enter a name and a valid Sri Lankan phone number such as 0771234567 or +94771234567.'
      );
      return;
    }

    setContactBusy(true);

    try {
      await saveContact(
        vehicle.id,
        {
          name: name.trim(),
          phone: normalized,
          relation: relation.trim(),
          smsEnabled,
          allowTestSms,
          notifyAccident,
          notifyDrowsiness,
          notifyEmergencyButton,
        },
        id
      );

      reset();
      setContactFormOpen(false);
    } catch (e: any) {
      Alert.alert(
        'Failed',
        e?.message || 'Try again.'
      );
    } finally {
      setContactBusy(false);
    }
  };

  const edit = (item: EmergencyContact) => {
    setId(item.id);
    setName(item.name);
    setPhone(item.phone);
    setRelation(item.relation || '');
    setSmsEnabled(item.smsEnabled === true);
    setAllowTestSms(item.allowTestSms === true);
    setNotifyAccident(item.notifyAccident === true);
    setNotifyDrowsiness(item.notifyDrowsiness === true);
    setNotifyEmergencyButton(
      item.notifyEmergencyButton === true
    );
    setExpandedContactId(null);
    setContactFormOpen(true);
  };

  const validLocation =
    typeof location?.latitude === 'number' &&
    typeof location?.longitude === 'number' &&
    Math.abs(location.latitude) <= 90 &&
    Math.abs(location.longitude) <= 180 &&
    !(location.latitude === 0 && location.longitude === 0);

  const locationText = validLocation
    ? `Latest known location: https://maps.google.com/?q=${location!.latitude},${location!.longitude}`
    : 'Location unavailable';

  const previewData = {
    vehicleName: vehicle.meta.name,
    plateNumber: vehicle.meta.plateNumber,
    eventType:
      testEvent === 'emergencyButton'
        ? 'Emergency button'
        : testEvent[0].toUpperCase() + testEvent.slice(1),
    eventTime: new Date().toLocaleString(),
    impactG: '0.00',
    locationUrl: locationText,
  };

  const selectedContact = items.find(
    item => item.id === testContactId
  );

  const savedTestTemplate =
    templates[testEvent] ||
    DEFAULT_SMS_TEMPLATES[testEvent];

  const testPreview =
    `TEST ONLY\nNo emergency response required.\n` +
    renderSmsTemplate(savedTestTemplate, previewData);

  const templateIssue =
    validateSmsTemplate(savedTestTemplate);

  const testIssue = !selectedContact
    ? 'Select a recipient in Test contact above. Editing a contact does not select it for testing.'
    : !selectedContact.smsEnabled
    ? 'Save the contact with SMS notifications ON.'
    : !selectedContact.allowTestSms
    ? 'Save the contact with Allow test SMS ON.'
    : !enabledFor(selectedContact, testEvent)
    ? 'Save the contact with the selected event alert ON.'
    : templateIssue
    ? `Message template needs correction: ${templateIssue}`
    : '';

  const canTest = !testIssue;

  const persistMode = async (
    mode: 'test' | 'normal'
  ) => {
    setModeBusy(true);

    try {
      await saveSmsModeConfig(vehicle.id, {
        mode,
        notifyAccident: globalAccident,
        notifyDrowsiness: globalDrowsiness,
        notifyEmergencyButton: globalEmergency,
      });

      setModeOpen(false);

      Alert.alert(
        'SMS settings saved',
        mode === 'normal'
          ? 'NORMAL SMS is enabled only for new eligible events.'
          : 'Automatic SMS is in TEST ONLY mode.'
      );
    } catch (e: any) {
      Alert.alert(
        'Unable to save SMS settings',
        e?.message || 'Try again.'
      );
    } finally {
      setModeBusy(false);
    }
  };

  const enableNormal = () =>
    Alert.alert(
      'Enable NORMAL SMS?',
      `New genuine alerts for ${vehicle.meta.plateNumber} can send real SMS to opted-in saved contacts. Test incidents, suppressed incidents, and older alerts remain ineligible. No emergency service is contacted automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable NORMAL SMS',
          style: 'destructive',
          onPress: () => persistMode('normal'),
        },
      ]
    );

  const saveEventSettings = () =>
    persistMode(modeConfig.mode);

  const sendTest = () => {
    if (testRequestBusy || testRequestLock.current) return;

    if (!selectedContact || !canTest) {
      Alert.alert(
        'Test SMS unavailable',
        testIssue || 'Select a valid test contact.'
      );
      return;
    }

    if (
      testRequestId &&
      (!testStatus ||
        testStatus.state === 'claimed' ||
        testStatus.state === 'sending')
    ) {
      Alert.alert(
        'Test already requested',
        'Check the current test status and SMS dispatch history before requesting another message.'
      );
      return;
    }

    Alert.alert(
      'Send test SMS?',
      `${selectedContact.name}\n${selectedContact.phone}\n\nThe SIM808 bridge will send a clearly marked test message.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Test SMS',
          onPress: async () => {
            if (testRequestLock.current) return;

            testRequestLock.current = true;
            setTestRequestBusy(true);
            setTestRequestId('');
            setTestStatus(null);

            try {
              const requestId =
                await createSmsTestRequest(
                  vehicle.id,
                  selectedContact.id,
                  testEvent
                );

              setTestRequestId(requestId);
            } catch (e: any) {
              Alert.alert(
                'Unable to request test SMS',
                e?.message || 'Try again.'
              );
            } finally {
              testRequestLock.current = false;
              setTestRequestBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View>
      <Heading
        title="SMS Settings"
        subtitle={`${vehicle.meta.name} - ${vehicle.meta.plateNumber}`}
      />

      {error ? (
        <Info text={`Firebase error: ${error}`} />
      ) : null}

      <Card>
        <ExpandableHeader
          testID="toggle-sms-mode"
          title={`Mode: ${
            modeConfig.mode === 'normal'
              ? 'NORMAL SMS'
              : 'TEST ONLY'
          }`}
          subtitle={
            modeOpen
              ? 'Tap to shrink SMS mode settings'
              : 'Tap to manage SMS mode and event settings'
          }
          expanded={modeOpen}
          onPress={() => {
            if (!modeBusy) {
              setModeOpen(value => !value);
            }
          }}
        />

        {modeOpen ? (
          <View style={{ marginTop: 14 }}>
            <Text
              style={{
                color:
                  modeConfig.mode === 'normal'
                    ? c.red
                    : c.green,
                fontWeight: '800',
                marginTop: 7,
              }}
            >
              {modeConfig.mode === 'normal'
                ? 'Real SMS may be sent for new eligible events.'
                : 'Automatic real SMS is disabled.'}
            </Text>

            {modeConfig.normalEnabledAt > 0 ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: 12,
                  marginTop: 5,
                }}
              >
                Enabled:{' '}
                {new Date(
                  modeConfig.normalEnabledAt
                ).toLocaleString()}
              </Text>
            ) : null}

            <Toggle
              title="Automatic accident SMS"
              value={globalAccident}
              onPress={() =>
                setGlobalAccident(x => !x)
              }
            />

            <Toggle
              title="Automatic drowsiness SMS"
              value={globalDrowsiness}
              onPress={() =>
                setGlobalDrowsiness(x => !x)
              }
            />

            <Toggle
              title="Automatic mobile emergency SMS"
              value={globalEmergency}
              onPress={() =>
                setGlobalEmergency(x => !x)
              }
            />

            <ActionButton
              title={
                modeBusy
                  ? 'Saving...'
                  : 'Save event settings'
              }
              disabled={modeBusy}
              onPress={saveEventSettings}
            />

            {modeConfig.mode === 'normal' ? (
              <ActionButton
                title="Return to TEST ONLY"
                variant="secondary"
                disabled={modeBusy}
                onPress={() => persistMode('test')}
              />
            ) : (
              <ActionButton
                title="Enable NORMAL SMS"
                variant="secondary"
                disabled={modeBusy}
                onPress={enableNormal}
              />
            )}

            <ActionButton
              title="Collapse mode settings"
              variant="secondary"
              disabled={modeBusy}
              onPress={() => setModeOpen(false)}
            />
          </View>
        ) : null}
      </Card>

      <Heading
        title="Emergency Contacts"
        subtitle="Each vehicle has its own SMS recipients and event preferences."
      />

      <Card>
        <Pressable
          testID="toggle-emergency-contact-form"
          accessibilityRole="button"
          accessibilityState={{
            expanded: contactFormOpen,
            disabled: contactBusy,
          }}
          disabled={contactBusy}
          onPress={toggleContactForm}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 3,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: c.navy,
                fontWeight: '900',
                fontSize: 17,
              }}
            >
              {id ? 'Edit contact' : 'Add contact'}
            </Text>

            <Text
              style={{
                color: c.muted,
                fontSize: 12,
                marginTop: 3,
              }}
            >
              {contactFormOpen
                ? 'Tap to shrink this form'
                : 'Tap to enter contact details'}
            </Text>
          </View>

          <Text
            style={{
              color: c.blue,
              fontWeight: '900',
              fontSize: 25,
            }}
          >
            {contactFormOpen ? '−' : '+'}
          </Text>
        </Pressable>

        {contactFormOpen ? (
          <View style={{ marginTop: 14 }}>
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
            />

            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="0771234567 or +94771234567"
            />

            <Field
              label="Relation / role"
              value={relation}
              onChangeText={setRelation}
              placeholder="Owner, family, monitoring contact..."
            />

            <Toggle
              title="Enable SMS notifications"
              value={smsEnabled}
              onPress={() =>
                setSmsEnabled(x => !x)
              }
            />

            <Toggle
              title="Allow test SMS"
              value={allowTestSms}
              onPress={() =>
                setAllowTestSms(x => !x)
              }
            />

            <Toggle
              title="Accident alerts"
              value={notifyAccident}
              onPress={() =>
                setNotifyAccident(x => !x)
              }
            />

            <Toggle
              title="Drowsiness alerts"
              value={notifyDrowsiness}
              onPress={() =>
                setNotifyDrowsiness(x => !x)
              }
            />

            <Toggle
              title="Mobile emergency alerts"
              value={notifyEmergencyButton}
              onPress={() =>
                setNotifyEmergencyButton(x => !x)
              }
            />

            <ActionButton
              title={
                contactBusy
                  ? 'Saving...'
                  : 'Save contact'
              }
              disabled={contactBusy}
              onPress={save}
            />

            <ActionButton
              title={
                id
                  ? 'Cancel edit and collapse'
                  : 'Cancel and collapse'
              }
              variant="secondary"
              disabled={contactBusy}
              onPress={closeContactForm}
            />
          </View>
        ) : null}
      </Card>

      {items.map(item => {
        const expanded =
          expandedContactId === item.id;

        return (
          <Card key={item.id}>
            <ExpandableHeader
              testID={`toggle-emergency-contact-${item.id}`}
              title={item.name}
              subtitle={`${item.phone} - ${
                expanded
                  ? 'Tap to shrink contact'
                  : 'Tap to view contact settings'
              }`}
              expanded={expanded}
              onPress={() =>
                setExpandedContactId(current =>
                  current === item.id
                    ? null
                    : item.id
                )
              }
            />

            {expanded ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: c.muted }}>
                  {item.relation || 'Contact'}
                </Text>

                <Text
                  style={{
                    color: item.smsEnabled
                      ? c.green
                      : c.muted,
                    fontWeight: '800',
                    marginTop: 7,
                  }}
                >
                  {item.smsEnabled
                    ? 'SMS ENABLED'
                    : 'SMS DISABLED'}
                </Text>

                <Text
                  style={{
                    color: c.muted,
                    fontSize: 12,
                    marginTop: 5,
                  }}
                >
                  Test SMS:{' '}
                  {item.allowTestSms
                    ? 'Allowed'
                    : 'Blocked'}{' '}
                  - Accident:{' '}
                  {item.notifyAccident
                    ? 'On'
                    : 'Off'}{' '}
                  - Drowsiness:{' '}
                  {item.notifyDrowsiness
                    ? 'On'
                    : 'Off'}{' '}
                  - Mobile emergency:{' '}
                  {item.notifyEmergencyButton
                    ? 'On'
                    : 'Off'}
                </Text>

                <ActionButton
                  title="Edit"
                  variant="secondary"
                  onPress={() => edit(item)}
                />

                <ActionButton
                  title="Delete"
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      'Delete contact?',
                      item.name,
                      [
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteContact(
                                vehicle.id,
                                item.id
                              );

                              setExpandedContactId(
                                current =>
                                  current === item.id
                                    ? null
                                    : current
                              );

                              if (id === item.id) {
                                reset();
                                setContactFormOpen(
                                  false
                                );
                              }

                              if (
                                testContactId ===
                                item.id
                              ) {
                                setTestContactId('');
                              }
                            } catch (e: any) {
                              Alert.alert(
                                'Failed',
                                e?.message ||
                                  'Try again.'
                              );
                            }
                          },
                        },
                      ]
                    )
                  }
                />

                <ActionButton
                  title="Collapse contact"
                  variant="secondary"
                  onPress={() =>
                    setExpandedContactId(null)
                  }
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      {!items.length ? (
        <Info text="No contacts saved for this vehicle." />
      ) : null}

      <Heading
        title="SMS Message Templates"
        subtitle="Edit each vehicle-specific event message independently."
      />

      {EVENT_TYPES.map(type => (
        <TemplateEditor
          key={`${vehicle.id}-${type}`}
          vehicleId={vehicle.id}
          type={type}
          saved={
            templates[type] ||
            DEFAULT_SMS_TEMPLATES[type]
          }
          previewData={{
            ...previewData,
            eventType:
              type === 'emergencyButton'
                ? 'Emergency button'
                : type[0].toUpperCase() +
                  type.slice(1),
          }}
        />
      ))}

      <Heading
        title="SMS Testing"
        subtitle="Tests are queued to the trusted bridge and sent sequentially through SIM808."
      />

      <Card>
        <SmallLabel>Test contact</SmallLabel>

        {!items.length ? (
          <Text style={{ color: c.muted }}>
            Add a contact first.
          </Text>
        ) : (
          items.map(item => (
            <ActionButton
              key={item.id}
              title={`${
                testContactId === item.id
                  ? '[SELECTED] '
                  : ''
              }${item.name} - ${item.phone}`}
              variant={
                testContactId === item.id
                  ? 'primary'
                  : 'secondary'
              }
              onPress={() => {
                setTestContactId(item.id);
                setTestRequestId('');
                setTestStatus(null);
              }}
            />
          ))
        )}

        <View style={{ height: 10 }} />

        <SmallLabel>Test event</SmallLabel>

        {EVENT_TYPES.map(type => (
          <ActionButton
            key={type}
            title={`${
              testEvent === type
                ? '[SELECTED] '
                : ''
            }${SMS_EVENT_LABELS[type]}`}
            variant={
              testEvent === type
                ? 'primary'
                : 'secondary'
            }
            onPress={() => {
              setTestEvent(type);
              setTestRequestId('');
              setTestStatus(null);
            }}
          />
        ))}

        <View style={{ height: 10 }} />

        <SmallLabel>
          Outgoing test preview
        </SmallLabel>

        <Text
          selectable
          style={{
            color: c.text,
            backgroundColor: c.background,
            borderRadius: 12,
            padding: 12,
            lineHeight: 19,
          }}
        >
          {testPreview}
        </Text>

        {testIssue ? (
          <Text
            style={{
              color: c.red,
              fontSize: 12,
              marginTop: 8,
            }}
          >
            {testIssue}
          </Text>
        ) : (
          <Text
            style={{
              color: c.green,
              fontSize: 12,
              marginTop: 8,
            }}
          >
            Recipient selected and saved SMS permissions
            verified. Confirm the phone number before
            sending.
          </Text>
        )}

        <ActionButton
          title={
            testRequestBusy
              ? 'Requesting...'
              : 'Send Test SMS'
          }
          disabled={testRequestBusy}
          onPress={sendTest}
        />

        {testRequestId ? (
          <Text
            selectable
            style={{
              color: c.muted,
              fontSize: 12,
              marginTop: 9,
            }}
          >
            Test event ID: {testRequestId}
          </Text>
        ) : null}

        {testError ? (
          <Text
            style={{
              color: c.red,
              marginTop: 7,
            }}
          >
            Status error: {testError}
          </Text>
        ) : null}

        {testRequestId ? (
          <Text
            style={{
              color:
                testStatus?.state === 'accepted'
                  ? c.green
                  : testStatus?.state === 'failed'
                  ? c.red
                  : c.yellow,
              fontWeight: '900',
              marginTop: 7,
            }}
          >
            Transmission:{' '}
            {testStatus?.state ||
              'Waiting for bridge'}
          </Text>
        ) : null}

        {testStatus?.errorCode ? (
          <Text
            style={{
              color: c.red,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Result code: {testStatus.errorCode}
          </Text>
        ) : null}

        {testStatus?.attemptedAt ? (
          <Text
            style={{
              color: c.muted,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Attempted:{' '}
            {new Date(
              testStatus.attemptedAt
            ).toLocaleString()}
          </Text>
        ) : null}

        <Text
          style={{
            color: c.muted,
            fontSize: 12,
            marginTop: 9,
          }}
        >
          Accepted means the SIM808 modem accepted the SMS.
          It does not confirm delivery to the recipient.
        </Text>
      </Card>

      <Heading
        title="SMS Dispatch History"
        subtitle="Latest modem outcomes for this vehicle. Accepted is not a delivery receipt."
      />

      {!history.length ? (
        <Info text="No SMS dispatch attempts recorded for this vehicle." />
      ) : (
        history.map((entry, index) => {
          const contact = items.find(
            item =>
              item.id === entry.contactId
          );

          const time =
            entry.attemptedAt ||
            entry.skippedAt ||
            entry.claimedAt;

          return (
            <Card
              key={`${entry.eventId}-${entry.contactId}-${index}`}
            >
              <Text
                style={{
                  color: c.navy,
                  fontWeight: '900',
                }}
              >
                {SMS_EVENT_LABELS[
                  entry.eventType || 'accident'
                ]}{' '}
                -{' '}
                {(
                  entry.dispatchMode || 'test'
                ).toUpperCase()}
              </Text>

              <Text
                style={{
                  color:
                    entry.state === 'accepted'
                      ? c.green
                      : entry.state === 'failed'
                      ? c.red
                      : c.yellow,
                  fontWeight: '800',
                  marginTop: 5,
                }}
              >
                Status:{' '}
                {entry.state || 'unknown'}
              </Text>

              <Text
                style={{
                  color: c.muted,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Contact:{' '}
                {contact?.name ||
                  'Deleted contact'}{' '}
                | Event: {entry.eventId}
              </Text>

              {time ? (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {new Date(
                    time
                  ).toLocaleString()}
                </Text>
              ) : null}

              {entry.errorCode ? (
                <Text
                  style={{
                    color: c.red,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Result: {entry.errorCode}
                </Text>
              ) : null}
            </Card>
          );
        })
      )}

      <Info text="TEST ONLY remains the default. NORMAL SMS applies only after explicit owner confirmation, only to new genuine events, and only to saved contacts opted into that event. Police, hospitals, and emergency hotlines are never contacted automatically." />
    </View>
  );
}
