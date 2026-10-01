const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const screen=read('src/screens/DrowsinessDetectionSettings.tsx');
const database=read('src/lib/database.ts');
const app=read('App.tsx');
const manager=read('src/screens/VehicleManager.tsx');
const settings=read('src/screens/SettingsScreen.tsx');
const alerts=read('src/screens/AlertsScreen.tsx');
const service=read('services/drowsiness/drowsiness_service.py');
const core=read('services/drowsiness/drowsiness_core.py');
const rules=JSON.parse(read('database.rules.json')).rules;

for(const text of ['Drowsiness Detection Settings','Continuous eye-closure duration','Start guided calibration','Current revision applied','Images are not displayed, recorded, or uploaded','SMS and emergency dispatch are suppressed'])assert(screen.includes(text),`Missing UI text: ${text}`);
for(const text of ['watchDrowsinessConfig','watchDrowsinessStatus','watchDrowsinessCalibrationStatus','saveDrowsinessDuration','requestDrowsinessCalibration'])assert(database.includes(text),`Missing database helper: ${text}`);
assert(app.includes("tab==='drowsiness'&&role==='owner'"));
assert(!manager.includes('onOpenDrowsiness'),'Drowsiness settings must be removed from Vehicle Management');
assert(settings.includes('onOpenDrowsiness')&&settings.includes('Drowsiness Detection Settings'),'Drowsiness settings must be available from Settings');
assert(app.includes("onBack={()=>setTab('settings')}"),'Drowsiness back action must return to Settings');
assert(alerts.includes('TEST DROWSINESS')&&alerts.includes('smsSuppressed'));

const configRules=rules.deviceConfig.$vehicleId.drowsiness;
assert(configRules['.read'].includes("ownerUid').val() === auth.uid"));
assert(configRules['.write'].includes("revision').val() === data.child('revision').val() + 1"));
assert(configRules.closureDurationMs['.validate'].includes('5000'));
assert(rules.drowsinessCalibrationRequests.$vehicleId.$requestId['.write'].includes('!data.exists()'));
assert.strictEqual(rules.deviceData.$vehicleId['.write'],false);

for(const marker of ['build_drowsiness_incident','"eventType": "drowsiness"','"esp32cam_phase1"','"esp32cam_drowsiness"','SmsModePolicy','CameraFrameError','FACE_OR_EYES_NOT_CONFIDENT','CAMERA_UNAVAILABLE'])assert(service.includes(marker));
for(const forbidden of ['cv2.imshow','cv2.imwrite','VideoWriter','firebase_admin.storage'])assert(!service.includes(forbidden),`Images must remain memory-only: ${forbidden}`);
assert(core.includes('UNKNOWN breaks continuity'));
assert(core.includes('elapsed > self.closure_duration_ms'));
assert(core.includes('self.armed = False'));

console.log('PASS: settings, calibration, memory-only processing, UNKNOWN safety, episode timing, and safe test/normal incident provenance.');
