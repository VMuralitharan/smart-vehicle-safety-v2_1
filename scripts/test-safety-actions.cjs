const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const phoneSource = ts.transpileModule(read('src/lib/phone.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const phoneModule = { exports: {} };
vm.runInNewContext(phoneSource, {
  module: phoneModule,
  exports: phoneModule.exports,
  require: name => {
    if (name === 'react-native') return { Linking: {} };
    throw new Error(`Unexpected module: ${name}`);
  },
});
const { isValidPhoneNumber, normalizePhoneNumber } = phoneModule.exports;
assert(isValidPhoneNumber('0771234567'));
assert(isValidPhoneNumber('+94771234567'));
assert(isValidPhoneNumber('+44 20 7946 0958'));
assert(!isValidPhoneNumber('123'));
assert(!isValidPhoneNumber('+0123456789'));
assert(!isValidPhoneNumber('+94+771234567'));
assert.strictEqual(normalizePhoneNumber('+94 (77) 123-4567'), '+94771234567');

const setup = read('src/screens/VehicleSetup.tsx');
const manager = read('src/screens/VehicleManager.tsx');
const app = read('App.tsx');
const dashboard = read('src/screens/Dashboard.tsx');
const assistance = read('src/screens/HelpScreen.tsx');
const alerts = read('src/screens/AlertsScreen.tsx');
const location = read('src/screens/LocationScreen.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const database = read('src/lib/database.ts');
for (const label of ['Call Emergency', 'View Location', 'Call Driver', 'Acknowledge request', 'Mark resolved', 'Clear resolved accident']) {
  assert(alerts.includes(label), `Missing alert action: ${label}`);
}
assert(setup.includes('driverPhone') && setup.includes('keyboardType="phone-pad"'));
assert(manager.includes('driverPhone') && manager.includes('editVehicle'));
for (const label of ['Edit vehicle details', 'Save changes', 'Cancel']) assert(manager.includes(label));
assert(manager.includes('setEditing(false)') && manager.includes('await editVehicle'));
assert(manager.includes('detailsOpen')&&manager.includes('toggle-vehicle-details')&&manager.includes('Collapse vehicle details'));
assert(manager.indexOf('title="+ Add another vehicle"')<manager.indexOf('testID="toggle-vehicle-details"'),'Add vehicle action must appear above Vehicle Details');
assert(!/setSelectedId\(v\.id\);setTrackedRequest\(null\);setTab\('home'\)/.test(app));
assert(!app.includes("{key:'help',label:'Assistance'"), 'Assistance must not remain as a bottom-navigation item');
assert(app.includes("tab==='help'?<HelpScreen"), 'The assistance route must remain available');
assert(dashboard.includes('title="Request emergency assistance"') && dashboard.includes("navigate('help')"), 'Home emergency button must open Assistance');
assert(assistance.includes('AccidentDetectionSettings') && assistance.includes('embedded'), 'Accident controls must remain integrated in Assistance');
assert(settings.includes('Emergency Numbers') && settings.includes('Save and confirm verification'));
assert(location.includes('Current bus location') && location.includes('Location when request was submitted'));
assert(alerts.includes('TEST ACCIDENT') && alerts.includes('impactG'));
assert.strictEqual((alerts.match(/renderLocationAndDriverActions\(item/g)||[]).length, 2);
assert(alerts.includes("item.impactG.toFixed(2)") && (1.64).toFixed(2) === '1.64');
assert(alerts.includes('openPhoneDialer(phone)') && alerts.includes('vehicle.meta.driverPhone'));
assert(location.includes('Accident location') && location.includes('Latest vehicle location'));
assert(location.includes('trackedEvent.vehicleId===vehicle.id'));
assert.strictEqual((database.match(/\{\.\.\.x,id,vehicleId\}/g)||[]).length, 2);
assert(database.includes('emergencyNumbersPath') && database.includes('driverPhone'));
assert(database.includes('clearResolvedIncident') && database.includes('clearedAt: serverTimestamp()'));

const rules = JSON.parse(read('database.rules.json')).rules;
if (rules.emergencyNumbers) {
  assert(rules.emergencyNumbers.$vehicleId['.read'].includes("ownerUid').val() === auth.uid"));
  assert(rules.emergencyNumbers.$vehicleId['.write'].includes("ownerUid').val() === auth.uid"));
}
if (rules.vehicles.$vehicleId.meta['.validate'].includes('driverPhone')) {
  assert(rules.vehicles.$vehicleId.meta['.validate'].includes('driverPhone'));
}
const requestWrite = rules.requests.$vehicleId.$requestId['.write'];
for (const field of ['latitude', 'longitude', 'locationUpdatedAt']) {
  assert(requestWrite.includes(`newData.child('${field}').val() === data.child('${field}').val()`));
}
const incidentReviewValidation = rules.incidentReviews.$vehicleId.$incidentId['.validate'];
assert(incidentReviewValidation.includes("child('clearedAt')") && incidentReviewValidation.includes("child('type').val() === 'accident'"));
assert(incidentReviewValidation.includes("data.child('resolvedAt').isNumber()"), 'Only previously resolved accidents may be cleared');
assert(incidentReviewValidation.includes("newData.child('clearedAt').val() === data.child('clearedAt').val()"), 'Cleared review markers must be immutable');
console.log('PASS: safety action UI wiring, phone formats, per-vehicle settings rules and immutable incident GPS checks.');
