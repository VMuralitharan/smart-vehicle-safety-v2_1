#include <Wire.h>
#include <SoftwareSerial.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

// Arduino Uno wiring retained from the original prototype.
const uint8_t BUZZER_PIN = 8;
const uint8_t SIM808_RX_PIN = 10;
const uint8_t SIM808_TX_PIN = 11;
const uint8_t MPU_ADDR = 0x68;
const uint8_t MPU_PWR_MGMT_1_REG = 0x6B;
const uint8_t MPU_ACCEL_CONFIG_REG = 0x1C;
const uint8_t MPU_ACCEL_CONFIG_8G = 0x10;
const float MPU_ACCEL_LSB_PER_G = 4096.0f;

SoftwareSerial sim808(SIM808_RX_PIN, SIM808_TX_PIN);

const unsigned long SENSOR_INTERVAL_MS = 100;
const unsigned long GPS_POLL_MS = 10000;

// The bridge enforces a 300-character final SMS limit. Base64 expands it to
// 400 characters; 470 bytes also leaves room for token, TEST/NORMAL mode,
// phone payload, separators, and the terminating null byte.
const size_t USB_LINE_CAPACITY = 470;
const size_t SMS_MESSAGE_CAPACITY = 301;
const size_t MODEM_RESPONSE_CAPACITY = 160;

char usbLine[USB_LINE_CAPACITY];
size_t usbLineLength = 0;
bool discardUsbLine = false;
bool usbLinePending = false;

char modemResponse[MODEM_RESPONSE_CAPACITY];

unsigned long configRevision = 0;
float accidentThresholdG = 2.50f;
uint8_t requiredSamples = 2;
unsigned long accidentCooldownMs = 30000;
bool benchTestMode = true;
// Defaults safe after every reset. The trusted bridge must explicitly apply
// NORMAL before MPU events can be emitted as genuine incidents.
bool normalSmsMode = false;
bool mpuConfigApplied = false;
bool mpuReady = false;

uint8_t impactSampleCount = 0;
unsigned long lastSensorAt = 0;
unsigned long lastAccidentAt = 0;
unsigned long lastGpsPollAt = 0;
unsigned long lastMpuReadErrorAt = 0;
bool mpuReadErrorReported = false;

enum SmsSendState {
  SMS_ACCEPTED,
  SMS_FAILED,
  SMS_UNCERTAIN
};

void captureUsbSerial();

void clearModemInput() {
  while (sim808.available()) {
    sim808.read();
  }
}

void resetModemResponse() {
  modemResponse[0] = '\0';
}

bool readModemResponse(unsigned long timeoutMs, bool stopAtPrompt) {
  resetModemResponse();
  size_t used = 0;
  bool sawPrompt = false;
  unsigned long startedAt = millis();

  while (millis() - startedAt < timeoutMs) {
    // Keep draining the Uno's small hardware RX buffer while a SIM808 command
    // is pending. Complete bridge commands are executed after this modem
    // transaction, so GPS and SMS AT commands cannot interleave.
    captureUsbSerial();
    while (sim808.available()) {
      char value = (char)sim808.read();
      if (used + 1 < MODEM_RESPONSE_CAPACITY) {
        modemResponse[used++] = value;
        modemResponse[used] = '\0';
      }
      if (value == '>') {
        sawPrompt = true;
        if (stopAtPrompt) {
          return true;
        }
      }
    }
    delay(1);
  }

  return sawPrompt;
}

void runAtCommand(const __FlashStringHelper *command, unsigned long timeoutMs) {
  clearModemInput();
  sim808.println(command);
  readModemResponse(timeoutMs, false);
}

bool responseContains(const char *needle) {
  return strstr(modemResponse, needle) != NULL;
}

bool modemRegistered() {
  return responseContains("+CREG: 0,1") ||
         responseContains("+CREG: 0,5") ||
         responseContains("+CREG: 1") ||
         responseContains("+CREG: 5");
}

bool modemSignalUsable() {
  char *signal = strstr(modemResponse, "+CSQ:");
  if (signal == NULL) {
    return false;
  }
  signal += 5;
  while (*signal == ' ') {
    signal++;
  }
  int rssi = atoi(signal);
  return rssi >= 5 && rssi <= 31;
}

void initializeSim808() {
  delay(2500);
  runAtCommand(F("AT"), 1000);
  runAtCommand(F("ATE0"), 1000);
  runAtCommand(F("AT+CMGF=1"), 1000);
  runAtCommand(F("AT+CGPSPWR=1"), 1500);
  Serial.println(F("SIM808_READY"));
}

void printHexByte(uint8_t value) {
  Serial.print(F("0x"));
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

bool writeMpuRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  uint8_t result = Wire.endTransmission(true);
  if (result != 0) {
    Serial.print(F("MPU_INIT_ERROR:write_register="));
    printHexByte(reg);
    Serial.print(F(",i2c_code="));
    Serial.println(result);
    return false;
  }
  return true;
}

bool readMpuRegister(uint8_t reg, uint8_t *value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  uint8_t addressResult = Wire.endTransmission(false);
  if (addressResult != 0) {
    Serial.print(F("MPU_INIT_ERROR:select_register="));
    printHexByte(reg);
    Serial.print(F(",i2c_code="));
    Serial.println(addressResult);
    return false;
  }

  uint8_t received = Wire.requestFrom(MPU_ADDR, (uint8_t)1, (uint8_t)true);
  if (received != 1 || !Wire.available()) {
    Serial.print(F("MPU_INIT_ERROR:read_register="));
    printHexByte(reg);
    Serial.print(F(",bytes_received="));
    Serial.println(received);
    return false;
  }

  *value = (uint8_t)Wire.read();
  return true;
}

void initializeMpu6050() {
  mpuReady = false;

  if (!writeMpuRegister(MPU_PWR_MGMT_1_REG, 0x00)) {
    Serial.println(F("MPU_INIT_FAILED:wake"));
    return;
  }
  delay(100);

  uint8_t accelConfigBefore = 0;
  if (!readMpuRegister(MPU_ACCEL_CONFIG_REG, &accelConfigBefore)) {
    Serial.println(F("MPU_INIT_FAILED:read_accel_config_before"));
    return;
  }
  Serial.print(F("MPU_ACCEL_CONFIG_BEFORE:"));
  printHexByte(accelConfigBefore);
  Serial.println();

  if (!writeMpuRegister(MPU_ACCEL_CONFIG_REG, MPU_ACCEL_CONFIG_8G)) {
    Serial.println(F("MPU_INIT_FAILED:set_accel_range_8g"));
    return;
  }

  uint8_t accelConfigAfter = 0;
  if (!readMpuRegister(MPU_ACCEL_CONFIG_REG, &accelConfigAfter)) {
    Serial.println(F("MPU_INIT_FAILED:read_accel_config_after"));
    return;
  }
  Serial.print(F("MPU_ACCEL_CONFIG_AFTER:"));
  printHexByte(accelConfigAfter);
  Serial.println();

  if (accelConfigAfter != MPU_ACCEL_CONFIG_8G) {
    Serial.print(F("MPU_INIT_FAILED:accel_config_mismatch,expected="));
    printHexByte(MPU_ACCEL_CONFIG_8G);
    Serial.print(F(",actual="));
    printHexByte(accelConfigAfter);
    Serial.println();
    return;
  }

  mpuReady = true;
  Serial.println(F("MPU_READY:accel_range=+/-8g,scale_lsb_per_g=4096"));
}

void soundAlarm(unsigned long durationMs) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}

int base64Value(char value) {
  if (value >= 'A' && value <= 'Z') return value - 'A';
  if (value >= 'a' && value <= 'z') return value - 'a' + 26;
  if (value >= '0' && value <= '9') return value - '0' + 52;
  if (value == '+') return 62;
  if (value == '/') return 63;
  return -1;
}

bool decodeBase64(const char *input, char *output, size_t outputCapacity) {
  size_t inputLength = strlen(input);
  if (inputLength == 0 || inputLength % 4 != 0) {
    return false;
  }

  size_t outputLength = 0;
  for (size_t offset = 0; offset < inputLength; offset += 4) {
    int values[4];
    for (uint8_t index = 0; index < 4; index++) {
      char value = input[offset + index];
      if (value == '=') {
        values[index] = -2;
      } else {
        values[index] = base64Value(value);
        if (values[index] < 0) return false;
      }
    }

    if (values[0] < 0 || values[1] < 0 ||
        (values[2] == -2 && values[3] != -2)) {
      return false;
    }

    unsigned long combined = ((unsigned long)values[0] << 18) |
                             ((unsigned long)values[1] << 12) |
                             ((unsigned long)(values[2] < 0 ? 0 : values[2]) << 6) |
                             (unsigned long)(values[3] < 0 ? 0 : values[3]);

    if (outputLength + 1 >= outputCapacity) return false;
    output[outputLength++] = (char)((combined >> 16) & 0xFF);

    if (values[2] != -2) {
      if (outputLength + 1 >= outputCapacity) return false;
      output[outputLength++] = (char)((combined >> 8) & 0xFF);
    }

    if (values[3] != -2) {
      if (outputLength + 1 >= outputCapacity) return false;
      output[outputLength++] = (char)(combined & 0xFF);
    }

    if ((values[2] == -2 || values[3] == -2) && offset + 4 != inputLength) {
      return false;
    }
  }

  output[outputLength] = '\0';
  return true;
}

bool validToken(const char *token) {
  if (strlen(token) != 16) return false;
  for (uint8_t index = 0; index < 16; index++) {
    if (!((token[index] >= '0' && token[index] <= '9') ||
          (token[index] >= 'a' && token[index] <= 'f'))) {
      return false;
    }
  }
  return true;
}

bool validPhone(const char *phone) {
  size_t length = strlen(phone);
  if (length < 10 || length > 16 || phone[0] != '+') return false;
  for (size_t index = 1; index < length; index++) {
    if (phone[index] < '0' || phone[index] > '9') return false;
  }
  return true;
}

bool validPlainTextMessage(const char *message) {
  size_t length = strlen(message);
  if (length == 0 || length >= SMS_MESSAGE_CAPACITY) return false;
  for (size_t index = 0; index < length; index++) {
    uint8_t value = (uint8_t)message[index];
    if (value == 9 || value == 10 || value == 13) continue;
    if (value < 32 || value > 126) return false;
  }
  return true;
}

void emitSmsResult(const char *token, const __FlashStringHelper *state,
                   const __FlashStringHelper *code) {
  Serial.print(F("SMS_RESULT:"));
  Serial.print(token);
  Serial.print(':');
  Serial.print(state);
  Serial.print(':');
  Serial.println(code);
}

SmsSendState sendSms(const char *phone, const char *message,
                     const __FlashStringHelper **resultCode) {
  clearModemInput();
  sim808.write(27);
  delay(100);

  runAtCommand(F("AT"), 1000);
  if (!responseContains("OK")) {
    *resultCode = F("MODEM_NOT_RESPONDING");
    return SMS_FAILED;
  }

  runAtCommand(F("AT+CPIN?"), 1500);
  if (!responseContains("READY")) {
    *resultCode = F("SIM_NOT_READY");
    return SMS_FAILED;
  }

  runAtCommand(F("AT+CREG?"), 1500);
  if (!modemRegistered()) {
    *resultCode = F("NETWORK_NOT_REGISTERED");
    return SMS_FAILED;
  }

  runAtCommand(F("AT+CSQ"), 1500);
  if (!modemSignalUsable()) {
    *resultCode = F("SIGNAL_UNAVAILABLE");
    return SMS_FAILED;
  }

  runAtCommand(F("AT+CMGF=1"), 1000);
  if (!responseContains("OK")) {
    *resultCode = F("TEXT_MODE_FAILED");
    return SMS_FAILED;
  }

  clearModemInput();
  sim808.print(F("AT+CMGS=\""));
  sim808.print(phone);
  sim808.println(F("\""));
  if (!readModemResponse(7000, true)) {
    sim808.write(27);
    *resultCode = F("NO_SMS_PROMPT");
    return SMS_FAILED;
  }

  sim808.print(message);
  sim808.write(26);
  readModemResponse(45000, false);

  if (responseContains("+CMGS:") && responseContains("OK")) {
    *resultCode = F("MODEM_ACCEPTED");
    return SMS_ACCEPTED;
  }
  if (responseContains("+CMS ERROR") || responseContains("ERROR")) {
    *resultCode = F("MODEM_REJECTED");
    return SMS_FAILED;
  }

  // After Ctrl-Z a missing final response is ambiguous. Mark it uncertain so
  // the bridge never retries and risks sending a duplicate.
  *resultCode = F("MODEM_RESULT_TIMEOUT");
  return SMS_UNCERTAIN;
}

void handleSmsRequest(char *line) {
  char *token = line + strlen("SMS_REQUEST:");
  char *dispatchMode = strchr(token, ':');
  if (dispatchMode == NULL) return;
  *dispatchMode++ = '\0';
  char *phone64 = strchr(dispatchMode, ':');
  if (phone64 == NULL) return;
  *phone64++ = '\0';
  char *message64 = strchr(phone64, ':');
  if (message64 == NULL) return;
  *message64++ = '\0';

  if (!validToken(token)) {
    return;
  }
  bool isTestRequest = strcmp(dispatchMode, "TEST") == 0;
  bool isNormalRequest = strcmp(dispatchMode, "NORMAL") == 0;
  if (!isTestRequest && !isNormalRequest) {
    emitSmsResult(token, F("failed"), F("INVALID_DISPATCH_MODE"));
    return;
  }
  if (isNormalRequest && !normalSmsMode) {
    emitSmsResult(token, F("failed"), F("NORMAL_MODE_REQUIRED"));
    return;
  }
  if (!benchTestMode) {
    emitSmsResult(token, F("failed"), F("BENCH_TEST_MODE_REQUIRED"));
    return;
  }
  size_t phoneCapacity = strlen(phone64) + 1;
  if (!decodeBase64(phone64, phone64, phoneCapacity) ||
      !validPhone(phone64)) {
    emitSmsResult(token, F("failed"), F("INVALID_PHONE"));
    return;
  }
  size_t messageCapacity = strlen(message64) + 1;
  if (!decodeBase64(message64, message64, messageCapacity) ||
      !validPlainTextMessage(message64)) {
    emitSmsResult(token, F("failed"), F("INVALID_MESSAGE"));
    return;
  }
  if (isTestRequest && strncmp(message64, "TEST ONLY\n", 10) != 0) {
    emitSmsResult(token, F("failed"), F("TEST_PREFIX_REQUIRED"));
    return;
  }
  if (isNormalRequest && strncmp(message64, "TEST ONLY\n", 10) == 0) {
    emitSmsResult(token, F("failed"), F("NORMAL_TEST_PREFIX_REJECTED"));
    return;
  }

  const __FlashStringHelper *resultCode = F("UNKNOWN");
  SmsSendState result = sendSms(phone64, message64, &resultCode);
  if (result == SMS_ACCEPTED) {
    emitSmsResult(token, F("accepted"), resultCode);
  } else if (result == SMS_FAILED) {
    emitSmsResult(token, F("failed"), resultCode);
  } else {
    emitSmsResult(token, F("uncertain"), resultCode);
  }
}

void handleSmsMode(char *line) {
  char *token = line + strlen("SMS_MODE:");
  char *mode = strchr(token, ':');
  if (mode == NULL) return;
  *mode++ = '\0';
  if (!validToken(token)) return;

  if (strcmp(mode, "TEST") == 0) {
    normalSmsMode = false;
  } else if (strcmp(mode, "NORMAL") == 0) {
    if (!mpuConfigApplied) {
      normalSmsMode = false;
      Serial.print(F("SMS_MODE_APPLIED:"));
      Serial.print(token);
      Serial.println(F(":TEST"));
      return;
    }
    normalSmsMode = true;
  } else {
    return;
  }

  Serial.print(F("SMS_MODE_APPLIED:"));
  Serial.print(token);
  Serial.print(':');
  Serial.println(mode);
}

void rejectConfig(const __FlashStringHelper *reason) {
  Serial.print(F("CONFIG_REJECTED:"));
  Serial.println(reason);
}

void handleConfig(char *line) {
  // Every new configuration attempt fails closed. A rejected or incomplete
  // command invalidates the prior authorization and requires a fresh, valid
  // CONFIG_APPLIED / SMS_MODE handshake before genuine events can resume.
  mpuConfigApplied = false;
  normalSmsMode = false;
  impactSampleCount = 0;

  char *payload = line + 4;
  char *parts[5];
  uint8_t count = 0;
  char *part = strtok(payload, ",");
  while (part != NULL && count < 5) {
    parts[count++] = part;
    part = strtok(NULL, ",");
  }
  if (count != 5 || part != NULL) {
    rejectConfig(F("FORMAT"));
    return;
  }

  char *end = NULL;
  unsigned long revision = strtoul(parts[0], &end, 10);
  if (*parts[0] == '\0' || *end != '\0') {
    rejectConfig(F("REVISION"));
    return;
  }
  float threshold = atof(parts[1]);
  long samples = strtol(parts[2], &end, 10);
  if (*parts[2] == '\0' || *end != '\0') {
    rejectConfig(F("SAMPLES"));
    return;
  }
  unsigned long cooldown = strtoul(parts[3], &end, 10);
  if (*parts[3] == '\0' || *end != '\0') {
    rejectConfig(F("COOLDOWN"));
    return;
  }
  long testMode = strtol(parts[4], &end, 10);
  if (*parts[4] == '\0' || *end != '\0') {
    rejectConfig(F("TEST_MODE"));
    return;
  }

  if (threshold < 1.10f || threshold > 8.00f ||
      samples < 2 || samples > 20 ||
      cooldown < 5000 || cooldown > 120000 || testMode != 1) {
    rejectConfig(F("RANGE_OR_TEST_MODE"));
    return;
  }

  configRevision = revision;
  accidentThresholdG = threshold;
  requiredSamples = (uint8_t)samples;
  accidentCooldownMs = cooldown;
  benchTestMode = true;
  impactSampleCount = 0;
  mpuConfigApplied = true;

  Serial.print(F("CONFIG_APPLIED:revision="));
  Serial.print(configRevision);
  Serial.print(F(",threshold_g="));
  Serial.print(accidentThresholdG, 2);
  Serial.print(F(",samples="));
  Serial.print(requiredSamples);
  Serial.print(F(",cooldown_ms="));
  Serial.print(accidentCooldownMs);
  Serial.println(F(",bench_test=1"));
}

void processUsbLine(char *line) {
  if (strncmp(line, "CFG:", 4) == 0) {
    handleConfig(line);
  } else if (strncmp(line, "SMS_MODE:", 9) == 0) {
    handleSmsMode(line);
  } else if (strncmp(line, "SMS_REQUEST:", 12) == 0) {
    handleSmsRequest(line);
  }
}

void captureUsbSerial() {
  if (usbLinePending) return;
  while (Serial.available() && !usbLinePending) {
    char value = (char)Serial.read();
    if (value == '\r') continue;
    if (value == '\n') {
      if (!discardUsbLine && usbLineLength > 0) {
        usbLine[usbLineLength] = '\0';
        usbLinePending = true;
        return;
      }
      usbLineLength = 0;
      discardUsbLine = false;
      continue;
    }
    if (discardUsbLine) continue;
    if (usbLineLength + 1 >= USB_LINE_CAPACITY) {
      discardUsbLine = true;
      usbLineLength = 0;
      continue;
    }
    usbLine[usbLineLength++] = value;
  }
}

void serviceUsbSerial() {
  captureUsbSerial();
  if (!usbLinePending) return;

  processUsbLine(usbLine);
  usbLinePending = false;
  usbLineLength = 0;
  discardUsbLine = false;
}

bool readAcceleration(float *magnitude) {
  if (!mpuReady) return false;

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  uint8_t addressResult = Wire.endTransmission(false);
  if (addressResult != 0) {
    unsigned long now = millis();
    if (!mpuReadErrorReported || now - lastMpuReadErrorAt >= 5000) {
      Serial.print(F("MPU_READ_ERROR:select_accel_data,i2c_code="));
      Serial.println(addressResult);
      lastMpuReadErrorAt = now;
      mpuReadErrorReported = true;
    }
    return false;
  }

  uint8_t received = Wire.requestFrom(MPU_ADDR, (uint8_t)6, (uint8_t)true);
  if (received != 6 || Wire.available() < 6) {
    unsigned long now = millis();
    if (!mpuReadErrorReported || now - lastMpuReadErrorAt >= 5000) {
      Serial.print(F("MPU_READ_ERROR:accel_data,bytes_received="));
      Serial.println(received);
      lastMpuReadErrorAt = now;
      mpuReadErrorReported = true;
    }
    return false;
  }

  int16_t rawAx = ((int16_t)Wire.read() << 8) | Wire.read();
  int16_t rawAy = ((int16_t)Wire.read() << 8) | Wire.read();
  int16_t rawAz = ((int16_t)Wire.read() << 8) | Wire.read();
  float ax = rawAx / MPU_ACCEL_LSB_PER_G;
  float ay = rawAy / MPU_ACCEL_LSB_PER_G;
  float az = rawAz / MPU_ACCEL_LSB_PER_G;
  *magnitude = sqrt(ax * ax + ay * ay + az * az);
  mpuReadErrorReported = false;
  return true;
}

void checkAccident(unsigned long now) {
  if (now - lastSensorAt < SENSOR_INTERVAL_MS) return;
  lastSensorAt = now;

  float magnitude = 0;
  if (!readAcceleration(&magnitude)) return;

  Serial.print(F("MPU_WINDOW magnitude_g="));
  Serial.print(magnitude, 2);
  Serial.print(F(",threshold_g="));
  Serial.print(accidentThresholdG, 2);
  Serial.print(F(",samples="));
  Serial.println(impactSampleCount);

  if (magnitude >= accidentThresholdG) {
    if (impactSampleCount < requiredSamples) impactSampleCount++;
  } else {
    impactSampleCount = 0;
  }

  if (impactSampleCount < requiredSamples ||
      (lastAccidentAt != 0 && now - lastAccidentAt < accidentCooldownMs)) {
    return;
  }

  impactSampleCount = 0;
  lastAccidentAt = now;
  soundAlarm(500);
  Serial.print(normalSmsMode && mpuConfigApplied ?
                 F("EVENT:ACCIDENT,impact_g=") :
                 F("EVENT:TEST_ACCIDENT,impact_g="));
  Serial.println(magnitude, 2);
}

void pollGps(unsigned long now) {
  if (now - lastGpsPollAt < GPS_POLL_MS) return;
  lastGpsPollAt = now;

  runAtCommand(F("AT+CGPSSTATUS?"), 1200);
  if (modemResponse[0] != '\0') Serial.print(modemResponse);
  runAtCommand(F("AT+CGPSINF=0"), 1800);
  if (modemResponse[0] != '\0') Serial.print(modemResponse);
}

void setup() {
  Serial.begin(115200);
  sim808.begin(9600);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin();
  initializeMpu6050();
  initializeSim808();

  // The bridge waits for this exact line before sending Firebase calibration.
  Serial.println(F("CONFIG_READY"));
}

void loop() {
  serviceUsbSerial();
  unsigned long now = millis();
  checkAccident(now);
  pollGps(now);
}
