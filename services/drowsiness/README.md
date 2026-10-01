# Phase 1 ESP32-CAM drowsiness service

This trusted local service fetches individual JPEG images from the existing
CameraWebServer `/capture` endpoint. Frames exist in memory only. The service
does not display, save, record, or upload images.

It uses MediaPipe Face Landmarker blendshapes for left/right eye closure.
Missing faces, camera errors, missing scores, and ambiguous/disagreeing eye
scores are `UNKNOWN`, never `CLOSED`.

TEST ONLY remains the default. In that mode every incident is marked
`isTest: true` and `smsSuppressed: true`. After the owner explicitly enables
NORMAL SMS, newly completed closure episodes use genuine drowsiness provenance.
Changing modes disarms the episode tracker until a confidently open-eye frame,
so an existing closure can never cross the activation boundary.

## Windows installation

Open PowerShell and run:

```powershell
Set-Location 'C:\Users\VM\Downloads\smart_vehicle_safety_v2_1_FIXED\smart-vehicle-safety-v2_1\services\drowsiness'
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\requirements-drowsiness.txt
New-Item -ItemType Directory -Force .\models
Invoke-WebRequest 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' -OutFile '.\models\face_landmarker.task'
```

The model URL is the official MediaPipe Face Landmarker model used by Google's
MediaPipe samples. No model or camera frame is uploaded by this service.

## Run tests

From the main Expo project folder:

```powershell
npm run check
npm run test:drowsiness
```

## Start the service

Replace the ESP32-CAM IP and Firebase vehicle ID, then run this from the
`services\drowsiness` folder:

```powershell
.\.venv\Scripts\python.exe .\drowsiness_service.py `
  --vehicle-id 'YOUR_FIREBASE_VEHICLE_ID' `
  --camera-url 'http://YOUR_ESP32_CAM_IP/capture' `
  --service-account 'C:\Users\VM\Downloads\svs_gps_firebase_bridge\svs-gps-bridge\serviceAccountKey.json' `
  --database-url 'https://smartvehiclesafety-f456d-default-rtdb.firebaseio.com/' `
  --model '.\models\face_landmarker.task' `
  --fps 2
```

The Python process does not open COM9. Keep the existing Node.js bridge running
separately for MPU6050/GPS functionality.
