#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "narzo 50 Pro 5G";
const char* WIFI_PASSWORD = "youshallnotpasss";

const char* BACKEND_URL = "http://10.43.176.127:5000/api/v1/iot/events";

const int SOS_BUTTON = 4;

int pressCount = 0;
unsigned long firstPressTime = 0;
const unsigned long PRESS_WINDOW = 3000;

void setup() {
Serial.begin(115200);

pinMode(SOS_BUTTON, INPUT_PULLUP);

WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

Serial.print("Connecting to WiFi");

while (WiFi.status() != WL_CONNECTED) {
delay(500);
Serial.print(".");
}

Serial.println();
Serial.println("WiFi Connected!");
Serial.print("ESP32 IP: ");
Serial.println(WiFi.localIP());
}

void sendSOS() {

if (WiFi.status() != WL_CONNECTED) {
Serial.println("WiFi not connected!");
return;
}

HTTPClient http;

http.begin(BACKEND_URL);
http.addHeader("Content-Type", "application/json");

String payload = "{"eventType":"SOS"}";
int responseCode = http.POST(payload);

Serial.print("SOS Response Code: ");
Serial.println(responseCode);

Serial.println(http.getString());

http.end();
}

void loop() {

if (digitalRead(SOS_BUTTON) == LOW) {

if (pressCount == 0) {
  firstPressTime = millis();
}

pressCount++;

Serial.print("SOS Button Press: ");
Serial.println(pressCount);

if (pressCount >= 3) {

  Serial.println("🚨 SOS TRIGGERED!");

  sendSOS();

  pressCount = 0;
  delay(3000);

} else {
  delay(300);
}

}

if (pressCount > 0 && millis() - firstPressTime > PRESS_WINDOW) {

Serial.println("Press window expired. Resetting.");

pressCount = 0;

}
}