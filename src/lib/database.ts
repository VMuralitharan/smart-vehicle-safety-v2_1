import {
  get, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update,
  type Unsubscribe,
} from 'firebase/database';
import { db } from '../config/firebase';
import type { DrowsinessCalibrationStatus, DrowsinessConfig, DrowsinessStatus, EmergencyContact, EmergencyNumbers, HelpRequest, Incident, JoinRequest, MpuConfig,
  IncidentReview, MpuConfigStatus, PendingJoin, Profile, PublicVehicle, RequestType, SmsDispatchHistoryItem, SmsDispatchStatus, SmsModeConfig, SmsTemplates,
  Vehicle, VehicleLocation, VehicleMeta } from './types';
import type {SmsEventType} from './sms';

function database() {
  if (!db) throw new Error('Firebase is not configured. Check .env.');
  return db;
}
const r = (path: string) => ref(database(), path);
export function watchValue<T>(path: string, callback: (value: T | null) => void,
  onError?: (message: string) => void): Unsubscribe {
  return onValue(r(path), snap => callback(snap.exists() ? snap.val() as T : null),
    error => onError?.(error.message));
}
export const profilePath = (uid: string) => `users/${uid}/profile`;
export const vehicleMetaPath = (vehicleId: string) => `vehicles/${vehicleId}/meta`;
export const devicePath = (vehicleId: string) => `deviceData/${vehicleId}`;
export const mpuConfigPath = (vehicleId: string) => `deviceConfig/${vehicleId}/mpu`;
export const drowsinessConfigPath = (vehicleId: string) => `deviceConfig/${vehicleId}/drowsiness`;
export const contactsPath = (vehicleId: string) => `emergencyContacts/${vehicleId}`;
export const emergencyNumbersPath = (vehicleId: string) => `emergencyNumbers/${vehicleId}`;
export const smsSettingsPath = (vehicleId: string) => `smsSettings/${vehicleId}`;
export const smsDispatchPath = (vehicleId: string) => `smsDispatch/${vehicleId}`;
export const requestPath = (vehicleId: string) => `requests/${vehicleId}`;

export function watchProfile(uid: string, callback: (profile: Profile | null) => void, fail?: (e: string)=>void) {
  return watchValue<Profile>(profilePath(uid), callback, fail);
}

export function watchMpuConfig(vehicleId: string, callback: (config: MpuConfig | null)=>void, fail?: (e:string)=>void) {
  return watchValue<MpuConfig>(mpuConfigPath(vehicleId),callback,fail);
}
export function watchMpuConfigStatus(vehicleId: string, callback: (status: MpuConfigStatus | null)=>void, fail?: (e:string)=>void) {
  return watchValue<MpuConfigStatus>(`${devicePath(vehicleId)}/mpuConfigStatus`,callback,fail);
}
export function watchDrowsinessConfig(vehicleId:string,callback:(config:DrowsinessConfig|null)=>void,fail?:(e:string)=>void){
  return watchValue<DrowsinessConfig>(drowsinessConfigPath(vehicleId),callback,fail);
}
export function watchDrowsinessStatus(vehicleId:string,callback:(status:DrowsinessStatus|null)=>void,fail?:(e:string)=>void){
  return watchValue<DrowsinessStatus>(`${devicePath(vehicleId)}/drowsinessStatus`,callback,fail);
}
export function watchDrowsinessCalibrationStatus(vehicleId:string,callback:(status:DrowsinessCalibrationStatus|null)=>void,fail?:(e:string)=>void){
  return watchValue<DrowsinessCalibrationStatus>(`${devicePath(vehicleId)}/drowsinessCalibrationStatus`,callback,fail);
}
function sameDrowsinessConfig(a:any,b:DrowsinessConfig|null){
  if(a==null||b==null)return a==null&&b==null;
  return a.closureDurationMs===b.closureDurationMs&&a.openEyeScore===b.openEyeScore&&
    a.closedEyeScore===b.closedEyeScore&&a.calibrated===b.calibrated&&
    a.revision===b.revision&&a.benchTestMode===b.benchTestMode;
}
export async function saveDrowsinessDuration(uid:string,vehicleId:string,expected:DrowsinessConfig|null,closureDurationMs:number){
  const owner=await get(r(vehicleMetaPath(vehicleId)));
  if(!owner.exists()||owner.val()?.ownerUid!==uid)throw new Error('Only this vehicle’s owner can change drowsiness settings.');
  const result=await runTransaction(r(drowsinessConfigPath(vehicleId)),current=>{
    if(!sameDrowsinessConfig(current,expected))return;
    const base=current||{openEyeScore:0,closedEyeScore:1,calibrated:false,revision:0,benchTestMode:true};
    return {...base,closureDurationMs,revision:base.revision+1,benchTestMode:true as const};
  },{applyLocally:false});
  if(!result.committed)throw new Error('Drowsiness settings changed on the server. Reload before saving.');
  return result.snapshot.val() as DrowsinessConfig;
}
export async function requestDrowsinessCalibration(vehicleId:string){
  const requestRef=push(r(`drowsinessCalibrationRequests/${vehicleId}`));
  if(!requestRef.key)throw new Error('Could not allocate a calibration request ID.');
  await set(requestRef,{requestedAt:serverTimestamp()});
  return requestRef.key;
}
function sameMpuConfig(a: any, b: MpuConfig | null) {
  if (a == null || b == null) return a == null && b == null;
  return a.thresholdG === b.thresholdG && a.requiredSamples === b.requiredSamples &&
    a.cooldownMs === b.cooldownMs && a.revision === b.revision && a.benchTestMode === b.benchTestMode;
}
export async function saveMpuConfig(uid: string, vehicleId: string, expected: MpuConfig | null,
  values: Omit<MpuConfig,'revision'>) {
  const owner = await get(r(vehicleMetaPath(vehicleId)));
  if (!owner.exists() || owner.val()?.ownerUid !== uid) throw new Error('Only this vehicle’s owner can change calibration settings.');
  const result = await runTransaction(r(mpuConfigPath(vehicleId)), current => {
    if (!sameMpuConfig(current,expected)) return;
    const revision = current == null ? 1 : current.revision + 1;
    if (!Number.isInteger(revision) || revision < 1) return;
    return {...values,benchTestMode:true as const,revision};
  },{applyLocally:false});
  if (!result.committed) throw new Error('Calibration changed on the server. Reload the latest settings before saving.');
  return result.snapshot.val() as MpuConfig;
}
export async function saveProfile(uid: string, input: { name: string; email: string; role: 'owner' | 'passenger' }) {
  const snap = await get(r(profilePath(uid)));
  if (snap.exists() && snap.val().role && snap.val().role !== input.role) {
    throw new Error('Account type cannot be changed after registration.');
  }
  return update(r(profilePath(uid)), { ...input, createdAt: snap.val()?.createdAt || serverTimestamp() });
}

/** Recover an account accidentally created as owner when it has no buses.
 * Firebase security rules independently enforce the same restrictions. */
export async function convertEmptyOwnerToPassenger(uid: string) {
  const [profileSnap, indexSnap, legacySnap] = await Promise.all([
    get(r(profilePath(uid))),
    get(r(`ownerVehicles/${uid}`)),
    get(r(`users/${uid}/vehicles`)),
  ]);
  if (profileSnap.val()?.role !== 'owner') throw new Error('Only an unassigned owner account can be converted.');
  if (indexSnap.exists() || legacySnap.exists()) {
    throw new Error('This account already has registered buses. Use another account for passenger access.');
  }
  return update(r(profilePath(uid)), { role: 'passenger' });
}

export function watchVehicles(uid: string, role: 'owner' | 'passenger',
  callback: (vehicles: Vehicle[]) => void, fail?: (message: string)=>void): Unsubscribe {
  const index = `${role === 'owner' ? 'ownerVehicles' : 'passengerVehicles'}/${uid}`;
  let children: Unsubscribe[] = [];
  let records: Record<string, VehicleMeta> = {};
  const stopIndex = onValue(r(index), snap => {
    children.forEach(stop => stop()); children = []; records = {};
    const ids = Object.keys(snap.val() || {});
    if (!ids.length) { callback([]); return; }
    const emit = () => callback(Object.entries(records).map(([id, meta]) => ({ id, meta }))
      .sort((a, b) => a.meta.plateNumber.localeCompare(b.meta.plateNumber)));
    ids.forEach(id => {
      children.push(onValue(r(vehicleMetaPath(id)), child => {
        if (child.exists()) records[id] = child.val();
        else delete records[id];
        emit();
      }, error => fail?.(error.message)));
    });
  }, error => fail?.(error.message));
  return () => { stopIndex(); children.forEach(stop => stop()); };
}

// An owner-issued code is a join REQUEST token, not device authentication.
// 10 chars from Firebase's random push ID (manual-entry friendly, owner approval required).
export async function addVehicle(uid: string, input: { name: string; plateNumber: string; route: string; deviceLabel: string; driverPhone: string }) {
  const newRef = push(r('vehicles'));
  if (!newRef.key) throw new Error('Could not allocate a vehicle ID.');
  const id = newRef.key;
  const invite = push(r('inviteEntropy')).key?.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  if (!invite || invite.length < 10) throw new Error('Could not generate join code.');
  const meta: VehicleMeta = { ownerUid: uid, name: input.name.trim(), plateNumber: input.plateNumber.trim(),
    route: input.route.trim(), deviceLabel: input.deviceLabel.trim(), driverPhone: input.driverPhone.trim(), createdAt: Date.now() };
  await set(r(`vehicles/${id}`), { meta, private: { joinCode: invite } });
  await set(r(`publicVehicles/${id}`), { name: meta.name, plateNumber: meta.plateNumber,
    route: meta.route, ownerUid: uid });
  await set(r(`ownerVehicles/${uid}/${id}`), true);
  return id;
}
export async function editVehicle(uid: string, vehicleId: string,
  changes: { name: string; plateNumber: string; route: string; deviceLabel: string; driverPhone?: string }) {
  await update(r(vehicleMetaPath(vehicleId)), {
    name: changes.name.trim(), plateNumber: changes.plateNumber.trim(),
    route: changes.route.trim(), deviceLabel: changes.deviceLabel.trim(),
    driverPhone: changes.driverPhone?.trim() || null,
  });
  await update(r(`publicVehicles/${vehicleId}`), { name: changes.name.trim(),
    plateNumber: changes.plateNumber.trim(), route: changes.route.trim() });
}
export function watchInvite(vehicleId: string, cb: (code: string | null)=>void, fail?: (e: string)=>void) {
  return watchValue<string>(`vehicles/${vehicleId}/private/joinCode`, cb, fail);
}
export async function rotateInvite(vehicleId: string) {
  const code = push(r('inviteEntropy')).key?.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  if (!code || code.length < 10) throw new Error('Could not generate code.');
  await set(r(`vehicles/${vehicleId}/private/joinCode`), code);
}
export async function previewVehicle(vehicleId: string) {
  const snap = await get(r(`publicVehicles/${vehicleId.trim()}`));
  return snap.exists() ? snap.val() as PublicVehicle : null;
}
export async function requestJoin(uid: string, profile: Profile, vehicleId: string, code: string) {
  const id = vehicleId.trim();
  const publicVehicle = await previewVehicle(id);
  if (!publicVehicle) throw new Error('Vehicle ID was not found. Check the code displayed inside your bus.');
  await set(r(`joinRequests/${id}/${uid}`), {
    requesterUid: uid, displayName: profile.name, code: code.trim().toUpperCase(),
    status: 'pending', createdAt: serverTimestamp(),
  });
  try {
    await set(r(`users/${uid}/pendingJoin`), {
      vehicleId: id, plateNumber: publicVehicle.plateNumber, requestedAt: serverTimestamp(),
    });
  } catch (error) {
    // Avoid an orphaned pending request that would block retries.
    await remove(r(`joinRequests/${id}/${uid}`));
    throw error;
  }
}
export function watchPendingJoin(uid: string, cb: (x: PendingJoin | null)=>void) {
  return watchValue<PendingJoin>(`users/${uid}/pendingJoin`, cb);
}
export async function cancelJoin(uid: string, vehicleId: string) {
  await remove(r(`joinRequests/${vehicleId}/${uid}`));
  await remove(r(`users/${uid}/pendingJoin`));
}
export function watchJoinRequests(vehicleId: string, cb: (x: JoinRequest[])=>void, fail?: (e: string)=>void) {
  return watchValue<Record<string, Omit<JoinRequest, 'id'>>>(`joinRequests/${vehicleId}`, value =>
    cb(Object.entries(value || {}).map(([id, v]) => ({ ...v, id }))
      .filter(v => v.status === 'pending')
      .sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0))), fail);
}
export async function approveJoin(vehicleId: string, passengerUid: string) {
  await set(r(`vehicleMembers/${vehicleId}/${passengerUid}`), { role: 'passenger', approvedAt: serverTimestamp() });
  await set(r(`passengerVehicles/${passengerUid}/${vehicleId}`), true);
  await update(r(`joinRequests/${vehicleId}/${passengerUid}`), { status: 'approved' });
}
export function rejectJoin(vehicleId: string, passengerUid: string) {
  return update(r(`joinRequests/${vehicleId}/${passengerUid}`), { status: 'rejected' });
}
export async function leaveVehicle(uid: string, vehicleId: string) {
  await remove(r(`passengerVehicles/${uid}/${vehicleId}`));
  await remove(r(`vehicleMembers/${vehicleId}/${uid}`));
}
export function watchMembers(vehicleId: string, cb: (x: {uid:string; role:string}[])=>void) {
  return watchValue<Record<string, {role:string}>>(`vehicleMembers/${vehicleId}`,
    v=> cb(Object.entries(v||{}).map(([uid, data])=>({uid,role:data.role}))));
}
export async function removeMember(vehicleId: string, uid: string) {
  await remove(r(`passengerVehicles/${uid}/${vehicleId}`));
  await remove(r(`vehicleMembers/${vehicleId}/${uid}`));
}

export function watchIncidents(vehicleId: string, cb: (events: Incident[])=>void, fail?: (e: string)=>void) {
  return watchValue<Record<string,Omit<Incident,'id'>>>(`${devicePath(vehicleId)}/incidents`, v=>
    cb(Object.entries(v||{}).map(([id, x]) => ({...x,id,vehicleId}))
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))),fail);
}
export function watchReviews(vehicleId: string, cb: (x: Record<string,IncidentReview>)=>void) {
  return watchValue<Record<string,IncidentReview>>(`incidentReviews/${vehicleId}`,
    v=>cb(v||{}));
}
export async function reviewIncident(vehicleId: string, incidentId: string, status: 'acknowledged' | 'resolved') {
  const field = status === 'acknowledged' ? 'acknowledgedAt' : 'resolvedAt';
  return update(r(`incidentReviews/${vehicleId}/${incidentId}`), { [field]: serverTimestamp() });
}
export function clearResolvedIncident(vehicleId: string, incidentId: string) {
  return update(r(`incidentReviews/${vehicleId}/${incidentId}`), { clearedAt: serverTimestamp() });
}

export function watchOwnerRequests(vehicleId: string, cb: (items: HelpRequest[])=>void, fail?: (e:string)=>void) {
  return watchValue<Record<string,Omit<HelpRequest,'id'>>>(requestPath(vehicleId), v=>
    cb(Object.entries(v||{}).map(([id,x])=>({...x,id,vehicleId}))
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))),fail);
}
export function watchMyRequests(uid: string, cb: (items: HelpRequest[])=>void, fail?: (e:string)=>void): Unsubscribe {
  let stops: Unsubscribe[] = [];
  const values: Record<string,HelpRequest> = {};
  const stop = onValue(r(`myRequests/${uid}`), snap => {
    stops.forEach(f=>f()); stops=[];
    Object.keys(values).forEach(k=>delete values[k]);
    const entries: Record<string,{vehicleId:string}> = snap.val() || {};
    const ids = Object.entries(entries);
    if (!ids.length) { cb([]); return; }
    ids.forEach(([id, item])=> {
      stops.push(onValue(r(`${requestPath(item.vehicleId)}/${id}`), child=> {
        if(child.exists()) values[id] = { id, vehicleId: item.vehicleId, ...child.val() };
        else delete values[id];
        cb(Object.values(values).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
      },e=>fail?.(e.message)));
    });
  },e=>fail?.(e.message));
  return ()=>{stop();stops.forEach(f=>f());};
}
export async function createHelpRequest(uid: string, profile: Profile, vehicleId: string,
  type: RequestType, message: string) {
  const newRef = push(r(requestPath(vehicleId)));
  if (!newRef.key) throw new Error('Request ID unavailable.');
  const id = newRef.key;
  const locSnap = await get(r(`${devicePath(vehicleId)}/location`));
  const loc = locSnap.exists() ? locSnap.val() as VehicleLocation : null;
  const valid = loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number' &&
    typeof loc.updatedAt === 'number' && Date.now() - loc.updatedAt < 300_000;
  const details = valid ? { latitude: loc!.latitude, longitude: loc!.longitude,
    locationUpdatedAt: loc!.updatedAt } : {};
  const value = { type, source:'mobile', message: message.trim().slice(0,500) || type,
    createdBy: uid, createdByName: profile.name || 'App user', createdAt: serverTimestamp(),
    status: 'pending', ...details };
  await set(newRef, value);
  try {
    await set(r(`myRequests/${uid}/${id}`), { vehicleId, createdAt: serverTimestamp() });
    return { id, indexed: true };
  } catch {
    // The main incident IS saved. Do not misreport it as an unsuccessful submission.
    return { id, indexed: false };
  }
}
export function updateRequestStatus(vehicleId: string, id: string, status: 'acknowledged'|'resolved') {
  return update(r(`${requestPath(vehicleId)}/${id}`), { status });
}

export function watchContacts(vehicleId: string, cb: (x: EmergencyContact[])=>void, fail?: (e:string)=>void) {
  return watchValue<Record<string, Omit<EmergencyContact,'id'>>>(contactsPath(vehicleId), v=>
    cb(Object.entries(v||{}).map(([id,x])=>({id,...x})).sort((a,b)=>a.name.localeCompare(b.name))),fail);
}
export async function saveContact(vehicleId: string, contact: Omit<EmergencyContact,'id'>, id?: string) {
  if(id) return set(r(`${contactsPath(vehicleId)}/${id}`),contact);
  return set(push(r(contactsPath(vehicleId))),contact);
}
export function deleteContact(vehicleId: string,id:string) { return remove(r(`${contactsPath(vehicleId)}/${id}`)); }

export function watchSmsTemplates(vehicleId:string,cb:(templates:SmsTemplates)=>void,fail?:(e:string)=>void){
  return watchValue<SmsTemplates>(`${smsSettingsPath(vehicleId)}/templates`,value=>cb(value||{}),fail);
}
export function saveSmsTemplate(vehicleId:string,type:SmsEventType,template:string){
  return set(r(`${smsSettingsPath(vehicleId)}/templates/${type}`),template.trim());
}
export function watchSmsModeConfig(vehicleId:string,cb:(config:SmsModeConfig|null)=>void,fail?:(e:string)=>void){
  return watchValue<SmsModeConfig>(`${smsSettingsPath(vehicleId)}/config`,cb,fail);
}
export async function saveSmsModeConfig(vehicleId:string,next:Pick<SmsModeConfig,'mode'|'notifyAccident'|'notifyDrowsiness'|'notifyEmergencyButton'>){
  const result=await runTransaction(r(`${smsSettingsPath(vehicleId)}/config`),current=>{
    const previous=(current||{}) as Partial<SmsModeConfig>;
    const enabling=previous.mode!=='normal'&&next.mode==='normal';
    return {...next,normalEnabledAt:next.mode==='normal'?(enabling?serverTimestamp() as unknown as number:Number(previous.normalEnabledAt)||serverTimestamp() as unknown as number):0,
      revision:(Number(previous.revision)||0)+1};
  },{applyLocally:false});
  if(!result.committed)throw new Error('SMS settings changed elsewhere. Reload and try again.');
}
export async function createSmsTestRequest(vehicleId:string,contactId:string,eventType:SmsEventType){
  const requestRef=push(r(`smsTestRequests/${vehicleId}`));
  if(!requestRef.key)throw new Error('Could not allocate a test request ID.');
  await set(requestRef,{contactId,eventType,requestedAt:serverTimestamp()});
  return requestRef.key;
}
export function watchSmsDispatchStatus(vehicleId:string,eventId:string,contactId:string,cb:(status:SmsDispatchStatus|null)=>void,fail?:(e:string)=>void){
  return watchValue<SmsDispatchStatus>(`${smsDispatchPath(vehicleId)}/${eventId}/${contactId}`,cb,fail);
}
export function watchSmsDispatchHistory(vehicleId:string,cb:(items:SmsDispatchHistoryItem[])=>void,fail?:(e:string)=>void){
  return watchValue<Record<string,Record<string,SmsDispatchStatus>>>(smsDispatchPath(vehicleId),value=>{
    const items:SmsDispatchHistoryItem[]=[];
    for(const [eventId,contacts] of Object.entries(value||{}))for(const [contactId,status] of Object.entries(contacts||{}))
      items.push({...status,eventId,contactId});
    items.sort((a,b)=>(b.attemptedAt||b.skippedAt||b.claimedAt||0)-(a.attemptedAt||a.skippedAt||a.claimedAt||0));
    cb(items.slice(0,25));
  },fail);
}

export function watchEmergencyNumbers(vehicleId: string, cb: (x: EmergencyNumbers)=>void, fail?: (e:string)=>void) {
  return watchValue<EmergencyNumbers>(emergencyNumbersPath(vehicleId), value=>cb(value||{}),fail);
}
export function saveEmergencyNumbers(vehicleId: string, numbers: {ambulance: string; police: string}) {
  const verifiedAt = serverTimestamp();
  return update(r(emergencyNumbersPath(vehicleId)), {
    ambulance: numbers.ambulance.trim() ? {phone:numbers.ambulance.trim(),verifiedAt} : null,
    police: numbers.police.trim() ? {phone:numbers.police.trim(),verifiedAt} : null,
  });
}

// Old v1 owner data is private. Preserve it and offer an explicit one-time import.
export async function countLegacyVehicles(uid: string) {
  const previous=await get(r(`users/${uid}/migrationComplete`));
  if(previous.val()===true) return 0;
  const snap=await get(r(`users/${uid}/vehicles`));
  return snap.exists()?Object.keys(snap.val()).length:0;
}
export async function importLegacyVehicles(uid: string) {
  const complete=await get(r(`users/${uid}/migrationComplete`));
  if(complete.val()===true) throw new Error('Old records were already imported.');
  const snap=await get(r(`users/${uid}/vehicles`));
  if(!snap.exists()) return 0;
  let count=0;
  for(const [oldId, item] of Object.entries<any>(snap.val())) {
    if(!item?.meta) continue;
    const m=item.meta;
    const mapRef=r(`users/${uid}/migrationMap/${oldId}`);
    const mapped=await get(mapRef);
    let id: string;
    if(mapped.exists()) id=mapped.val() as string;
    else {
      id=await addVehicle(uid,{name:m.name||'Bus',plateNumber:m.plateNumber||'Unknown',
        route:m.route||'',deviceLabel:'',driverPhone:String(m.driverPhone||'')});
      await set(mapRef,id);
    }
    const contacts=item.contacts||{};
    for(const [contactId,contact] of Object.entries<any>(contacts)) {
      await saveContact(id,{name:String(contact.name||''),phone:String(contact.phone||''),
        relation:String(contact.relation||'')},contactId);
    }
    // Old mobile incidents remain archived; they are not trusted hardware events.
    count++;
  }
  await set(r(`users/${uid}/migrationComplete`),true);
  return count;
}
