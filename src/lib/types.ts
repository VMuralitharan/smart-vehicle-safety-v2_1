export type Role = 'owner' | 'passenger';
export type Profile = { name: string; email?: string; role?: Role; createdAt?: number };
export type VehicleMeta = {
  ownerUid: string; name: string; plateNumber: string; route: string;
  deviceLabel?: string; driverPhone?: string; createdAt?: number;
};
export type Vehicle = { id: string; meta: VehicleMeta };
export type PublicVehicle = { name: string; plateNumber: string; route: string; ownerUid: string };
export type JoinRequest = {
  id: string; requesterUid: string; displayName: string; code: string;
  status: 'pending' | 'approved' | 'rejected'; createdAt?: number;
};
export type PendingJoin = { vehicleId: string; plateNumber: string; requestedAt?: number };
export type VehicleStatus = {
  driverStatus?: 'awake' | 'drowsy' | 'unknown'; accidentDetected?: boolean;
  emergencyButton?: boolean; updatedAt?: number; source?: string;
};
export type VehicleLocation = { latitude?: number; longitude?: number; updatedAt?: number };
export type MpuConfig = {
  thresholdG: number; requiredSamples: number; cooldownMs: number;
  revision: number; benchTestMode: true;
};
export type MpuConfigStatus = Partial<MpuConfig> & { state?: string; appliedAt?: number };
export type DrowsinessConfig = {
  closureDurationMs: number; openEyeScore: number; closedEyeScore: number;
  calibrated: boolean; revision: number; benchTestMode: true;
};
export type DrowsinessStatus = {
  state?: 'applied'|'awaiting_calibration'|'error'; appliedRevision?: number;
  closureDurationMs?: number; calibrated?: boolean; benchTestMode?: boolean;
  appliedAt?: number; updatedAt?: number; eyeState?: 'OPEN'|'CLOSED'|'UNKNOWN';
  closureElapsedMs?: number; cameraConnected?: boolean; resultCode?: string;
};
export type DrowsinessCalibrationStatus = {
  requestId?: string; state?: 'prepare_open'|'sampling_open'|'prepare_closed'|'sampling_closed'|'complete'|'failed';
  instruction?: string; updatedAt?: number; appliedRevision?: number;
  openEyeScore?: number; closedEyeScore?: number;
};
export type Incident = {
  id: string; type: 'accident' | 'drowsiness' | 'manual' | 'other';
  eventType?: 'accident'|'drowsiness'|'emergencyButton'; source?: string; message?: string; createdAt?: number;
  vehicleId?: string; latitude?: number; longitude?: number; locationUpdatedAt?: number;
  isTest?: boolean; impactG?: number; durationMs?: number; settingsRevision?: number;
  smsSuppressed?: boolean;
};
export type IncidentReview = {
  acknowledgedAt?: number; resolvedAt?: number; clearedAt?: number;
};
export type RequestType = 'medical' | 'security' | 'vehicle_issue' | 'other';
export type HelpRequest = {
  id: string; vehicleId?: string; type: RequestType; source: 'mobile'; message: string;
  createdBy: string; createdByName: string; createdAt?: number;
  status: 'pending' | 'acknowledged' | 'resolved';
  latitude?: number; longitude?: number; locationUpdatedAt?: number;
};
export type EmergencyContact = {
  id: string; name: string; phone: string; relation?: string;
  smsEnabled?: boolean; allowTestSms?: boolean;
  notifyAccident?: boolean; notifyDrowsiness?: boolean; notifyEmergencyButton?: boolean;
};
export type SmsTemplates = Partial<Record<import('./sms').SmsEventType,string>>;
export type SmsModeConfig = {
  mode: 'test'|'normal'; normalEnabledAt: number;
  notifyAccident: boolean; notifyDrowsiness: boolean; notifyEmergencyButton: boolean;
  revision: number;
};
export type SmsDispatchStatus = {
  eventId?: string; eventType?: import('./sms').SmsEventType; contactId?: string;
  dispatchMode?: 'test'|'normal'; claimedAt?: number;
  state?: 'claimed'|'sending'|'accepted'|'failed'|'uncertain'|'skipped';
  attemptedAt?: number; acceptedAt?: number; skippedAt?: number; errorCode?: string;
};
export type SmsDispatchHistoryItem = SmsDispatchStatus & { eventId: string; contactId: string };
export type EmergencyNumberType = 'ambulance' | 'police';
export type EmergencyNumber = { phone: string; verifiedAt?: number };
export type EmergencyNumbers = Partial<Record<EmergencyNumberType, EmergencyNumber>>;
