#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <deque>
#include <string>
#include <utility>
#include <vector>
#define HIGH 1
#define LOW 0
#define INPUT_PULLUP 2
#define OUTPUT 3
struct String : std::string {
  using std::string::string;
  String(const std::string& value) : std::string(value) {}
  explicit String(int value) : std::string(std::to_string(value)) {}
};
inline unsigned long testClock = 0;
inline std::vector<std::pair<unsigned long, int>> buttonEdges;
inline unsigned long millis() { return testClock; }
inline void delay(unsigned long ms) { testClock += ms; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int fakeI2cSdaLevel = HIGH, fakeI2cSclLevel = HIGH;
inline int digitalRead(int pin) {
  if (pin == 21) return fakeI2cSdaLevel;
  if (pin == 22) return fakeI2cSclLevel;
  int value = HIGH;
  for (const auto& edge : buttonEdges) if (testClock >= edge.first) value = edge.second;
  return value;
}
struct SerialFake {
  std::string output;
  void begin(int) {}
  void println(const char* text = "") { output += std::string(text) + "\n"; }
  template<class... Args> void printf(const char* format, Args... args) {
    char line[512];
    std::snprintf(line, sizeof(line), format, args...);
    output += line;
  }
};
inline SerialFake Serial;
