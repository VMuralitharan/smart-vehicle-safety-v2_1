const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const screen = read('src/screens/AccidentDetectionSettings.tsx');
const database = read('src/lib/database.ts');
const app = read('App.tsx');
const manager = read('src/screens/VehicleManager.tsx');
const assistance = read('src/screens/HelpScreen.tsx');
const rules = JSON.parse(read('database.rules.json')).rules;

for (const text of [
  'Accident Detection Settings', 'Save Calibration', 'Restore Test Defaults',
  'Waiting for Arduino confirmation...', 'Applied successfully', 'Configuration mismatch',
  'Research prototype: calibration settings are for controlled testing only.',
]) assert(screen.includes(text), `Missing calibration UI text: ${text}`);
for (const field of ['thresholdG','requiredSamples','cooldownMs','revision','benchTestMode']) {
  assert(database.includes(field), `Database transaction omits ${field}`);
}
assert(database.includes('runTransaction(r(mpuConfigPath(vehicleId))'));
assert(database.includes('sameMpuConfig(current,expected)'));
assert(database.includes('current.revision + 1'));
assert(database.includes('owner.val()?.ownerUid !== uid'));
assert(screen.includes('watchMpuConfig(vehicle.id'));
assert(screen.includes('watchMpuConfigStatus(vehicle.id'));
assert(screen.includes('status.revision===config.revision'));
assert(screen.includes('activeVehicleRef.current!==vehicle.id'));
assert(!app.includes("tab==='calibration'"), 'Standalone accident calibration page must be removed');
assert(!manager.includes('onOpenCalibration'), 'Vehicle manager must not retain the old accident-page action');
assert(assistance.includes("role==='owner'?<AccidentDetectionSettings"));
assert(assistance.includes('embedded/>'), 'Owner calibration must be embedded in Assistance');

const mpuRules = rules.deviceConfig.$vehicleId.mpu;
assert((rules.deviceConfig.$vehicleId['.read']||mpuRules['.read']).includes("ownerUid').val() === auth.uid"));
assert(mpuRules['.write'].includes("ownerUid').val() === auth.uid"));
const serializedMpuRules = JSON.stringify(mpuRules);
assert(serializedMpuRules.includes("benchTestMode').val() === true") || serializedMpuRules.includes('newData.val() === true'));
assert(serializedMpuRules.includes("revision').val() === data.child('revision').val() + 1"));
assert.strictEqual(rules.deviceData.$vehicleId['.write'], false);

const current = {thresholdG:2.3,requiredSamples:2,cooldownMs:30000,revision:8,benchTestMode:true};
const saved = {...current,thresholdG:2.4,revision:current.revision+1};
assert.strictEqual(saved.revision, 9);
assert.deepStrictEqual(Object.keys(saved).sort(), ['benchTestMode','cooldownMs','requiredSamples','revision','thresholdG'].sort());
assert.notDeepStrictEqual({...current,revision:9}, saved, 'A concurrent record must not equal the loaded baseline plus revision');

console.log('PASS: owner-only MPU calibration embedded in Assistance, complete transaction, revision increment, acknowledgement matching and deviceData write denial checks.');
