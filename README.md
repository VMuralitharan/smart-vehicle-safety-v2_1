# Smart Vehicle Safety — React Native app v2.1 (registration fix)

A Firebase-backed Android/iOS app for a public-transport safety project. This release supports separate **owner/manager** and **passenger** accounts, shared bus records, an approved passenger joining process, and real mobile-origin assistance requests. It does **not** manufacture location/sensor readings.


## v2.1: correcting the forced vehicle-registration flow

This version has a dedicated account-choice screen **BEFORE** the name/email/password form.
Select **Passenger** to create a passenger account: the next screen is **Join your bus**, never **Register your vehicle**.
Select **Owner / Manager** only when you actually register/manages buses.
Existing v1 accounts with no stored role now prompt for an explicit selection; there is no default Owner selection.

If an account was accidentally saved as Owner but has **no buses in the new or legacy database indexes**, the Register your vehicle screen offers **I am a PASSENGER — switch account type**. This is a one-time correction verified against Firebase rules; accounts with vehicles cannot convert this way. Do not register a fictitious vehicle.

To confirm you opened the correct source, the sign-in screen shows `v2.1 · Explicit account selection` and `package.json` says `2.1.0`. Exit the previous Expo server, run the new folder's server, and rescan its QR code; clearing Metro alone does not point it to a different source folder.

For an interrupted signup, Firebase Authentication can be created before the profile write finishes. If an existing account has no role, the setup screen waits for an explicit choice rather than silently selecting Owner.

## IMPORTANT — upgrade from the earlier app

Keep your existing **Firebase project**. Before changing its Realtime Database rules, export a JSON backup from **Realtime Database → Data → ⋮ → Export JSON** (if enabled in your console). The old Firebase data is not deleted by these new rules.

1. Extract this ZIP into a **new folder**. Open `smart-vehicle-safety-v2` in VS Code.
2. Copy **your existing `.env`** from the old app into this new folder. Keep it private; do not send it in screenshots or upload it to GitHub. The template `.env.example` shows the required names.
3. In the **same Firebase project**, replace the Realtime Database rules with the entire contents of the NEW `database.rules.json`, then click **Publish**. The previous v1 rules cannot support the shared passenger access model.
4. Confirm **Firebase Authentication → Sign-in method → Email/Password** remains enabled.
5. In this new folder run:

   ```powershell
   npm install
   npx expo install --fix
   npx expo start -c
   ```

6. Open the new app in Expo Go. Camera permission is requested only when scanning a joining QR code. If the app reports a missing native module after adding camera/SVG packages, stop Expo, run `npx expo install expo-camera react-native-svg`, then restart with `npx expo start -c`.

Do **not** copy the old `node_modules` folder. Do **not** run `npm audit fix --force`; it may break Expo package compatibility. If you change `.env`, restart Expo with `-c`.

## Full flow: owner and passenger

### Owner / manager

1. Choose **Owner / manager** BEFORE filling the registration form, or sign into a previous account and explicitly select Owner / manager if its profile has no role.
2. Register bus details: name, registration number, route, optional inventory device label. GPS and sensor values remain unavailable until actual authenticated hardware is connected.
3. Go to **Vehicles** to edit details, display the generated QR code, or share Bus ID + join code manually. Owner may rotate the code; the old code then stops admitting new requests.
4. After a passenger submits a request, **Vehicles → Join requests → Approve** (or reject). Approval grants this passenger access to only the selected bus.
5. Owner can add/edit/delete emergency contacts, view the last known GPS map, review incidents and mobile assistance requests, submit a manual request, acknowledge/resolve incidents, and revoke passenger access.

### Passenger

1. Sign out of the owner account. Choose **Passenger** on the initial account-choice screen, then fill the registration form. If an accidentally created owner account has no vehicles, use its one-time **switch to Passenger** button instead.
2. Tap **Scan bus QR code** or enter Bus ID manually, then confirm plate number and route, supply join code, and request access.
3. Owner approves. The passenger's app receives membership in real time; it now shows that bus's status and latest GPS if available.
4. Passenger may submit **Medical / Security / Vehicle issue / Other** assistance requests and view their **own** requests and owner-updated status. They cannot edit vehicles, contacts, review incidents on behalf of owner, or see other passengers' private requests.
5. Passenger may leave a joined bus from Settings.

The Bus ID, invitation code, vehicle registration number, and optional device label are **different identifiers**. An invitation code does not authenticate physical hardware. The QR value is `SVS1|<vehicleId>|<joinCode>`; it merely streamlines a user request, and still requires owner approval.

## Mobile emergency requests: what works now

Requests are genuine authenticated writes into `/requests/{vehicleId}/{requestId}`. The app checks owner or approved passenger membership via database rules, attaches a *recent* stored bus GPS point if available, and saves a private `/myRequests/{uid}/{requestId}` index. Owner sees new requests in real time while app is open and can mark acknowledged/resolved; author sees updated status. New foreground events show a banner for owner.

**Not yet included:** actual background push delivery, SMS dispatch, calls to emergency services, and verified hardware ingestion. The app's successful request confirmation means **saved in Firebase**, not **delivered to a responder**. The separate physical emergency button and SIM808 SMS channel will be integrated later. Controlled test phone numbers only; do not send test alerts to police or emergency services.

## Device and data architecture

```
users/{uid}/profile                               // authenticated identity & immutable role
users/{uid}/pendingJoin                           // passenger's pending application
ownerVehicles/{ownerUid}/{vehicleId}              // private fleet index
passengerVehicles/{passengerUid}/{vehicleId}      // approved access index
vehicles/{vehicleId}/meta                         // owner, plate, route, device inventory label
vehicles/{vehicleId}/private/joinCode             // owner-only invite secret
publicVehicles/{vehicleId}                        // limited signed-in joining preview
joinRequests/{vehicleId}/{passengerUid}           // pending / approved / rejected
vehicleMembers/{vehicleId}/{passengerUid}         // actual authorization source
emergencyContacts/{vehicleId}/{contactId}        // owner only
deviceData/{vehicleId}/status                     // trusted backend writes only
deviceData/{vehicleId}/location                   // trusted backend writes only
deviceData/{vehicleId}/incidents/{incidentId}     // trusted backend writes only
incidentReviews/{vehicleId}/{incidentId}         // owner review without changing source event
requests/{vehicleId}/{requestId}                  // authenticated mobile assistance
myRequests/{uid}/{requestId}                      // author-only list index
```

Location timestamp and status timestamp are numeric Unix **milliseconds**. The status is *stale* after 60 seconds, and location is labelled last-known when older than five minutes. The app does not use the phone's location as the bus location. For `deviceData`, the database rules deliberately deny client writes: only a future device-authenticated backend using Firebase Admin privileges can populate it. Do not put service-account credentials or owner passwords in Arduino/ESP32 firmware.

### Existing v1 data

The old private records under `users/{uid}/vehicles` remain untouched. If your old owner account has records, the first-run recovery screen (or the new **Vehicles** screen) offers an import for vehicles and contacts. Old incident records are preserved at their original location rather than relabelled as verified device-generated events. Import only once: repeat imports would otherwise duplicate records. The import records a per-vehicle migration map and a final `users/{uid}/migrationComplete` flag, so interrupted imports can resume without re-creating already-mapped buses.

## Product scope / limitations

- One app; two roles: **Owner/manager** and **Passenger**. This is not a separate platform super-admin role.
- In-app help requests and real-time owner foreground banner are implemented. Background push (FCM/Expo notifications) and automatic SMS are **not** claimed to work without additional backend and device code.
- QR scan/generation use Expo Camera and an SVG-based QR component. Manual ID+join-code entry is also supported.
- Device inventory label is *not* a verified pairing credential; secure device onboarding is a separate future system.
- Camera footage is not stored by the app; device-level drowsiness processing should send event summaries only.
- React Native map currently uses `react-native-maps`; production binary map provider configuration may be required for distribution outside Expo Go.

## Quick functional acceptance test

1. Old and new owner accounts can log in; profile role remains stable.
2. Owner creates bus and edits plate/route; data persists after restart.
3. Passenger cannot view a bus before approval; invalid join code is denied by Firebase rules.
4. Owner scans pending requests and approves; only that passenger gains access.
5. Passenger sends a request; owner sees it in Firebase and the app; owner acknowledges, passenger sees the new status.
6. Passenger cannot edit vehicle or contact records or acknowledge a hardware event.
7. No device reports → offline / unknown status and no GPS marker. No fabricated 'safe' readings.
8. Owner can revoke membership; former passenger loses access.

