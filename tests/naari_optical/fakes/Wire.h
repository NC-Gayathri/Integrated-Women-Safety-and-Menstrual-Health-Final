#pragma once
#include "Arduino.h"
// Hardware boundary only. endTransmission(false) defers bus I/O to requestFrom,
// matching ESP32 Wire.cpp; the tests execute the real sketch above this boundary.
struct WireFake {
  std::array<uint8_t, 256> regs{};
  std::vector<uint8_t> tx;
  std::deque<uint8_t> rx;
  uint8_t address = 0, pointer = 0, modeRegister = 0x09;
  bool nonStop = false, absent = false, failReads = false;
  bool failRepeatedStart = false, stuckReset = false, shutdown = false;
  bool configured = false, shortFifo = false, fifoErrorAfterConsumption = false;
  int failWriteReg = -1, mismatchReg = -1, failReadReg = -1;
  int transientWrites = 0, pointerNacks = 0, fifoRequests = 0;
  unsigned long operationMs = 1;
  uint16_t timeoutMs = 50;
  void reset(uint8_t part) {
    *this = WireFake{};
    regs[0xFF] = part; regs[0xFE] = 0x01;
    modeRegister = part == 0x11 ? 0x06 : 0x09;
  }
  void begin(int, int) {}
  void setClock(int) {}
  void setTimeOut(uint16_t ms) { timeoutMs = ms; }
  void beginTransmission(uint8_t addr) { address = addr; tx.clear(); nonStop = false; }
  void write(uint8_t value) { tx.push_back(value); }
  uint8_t endTransmission(bool stop = true) {
    if (!stop) { nonStop = true; return 0; }
    delay(absent || address != 0x57 ? timeoutMs : operationMs);
    if (absent || address != 0x57) return 2;
    if (tx.empty()) return 0;
    pointer = tx[0];
    if (tx.size() == 1) {
      if (pointerNacks > 0) { --pointerNacks; return 2; }
      return 0;
    }
    if (pointer == failWriteReg || transientWrites-- > 0) return 2;
    uint8_t value = tx[1];
    if (pointer == modeRegister && value == 0x40) {
      const auto part = regs[0xFF], revision = regs[0xFE];
      regs.fill(0); regs[0xFF] = part; regs[0xFE] = revision;
      regs[modeRegister] = stuckReset ? 0x40 : 0;
      configured = false;
    } else {
      regs[pointer] = value;
      if (pointer == modeRegister && value == 3) {
        configured = true;
        if (shutdown) regs[pointer] |= 0x80;
      }
    }
    return 0;
  }
  int requestFrom(int addr, int length, int) {
    rx.clear();
    const bool combined = nonStop; nonStop = false;
    if (combined) pointer = tx[0];
    const bool failed = absent || addr != 0x57 || failReads || pointer == failReadReg ||
                        (combined && failRepeatedStart);
    delay(failed ? timeoutMs : operationMs);
    if (failed) return 0;
    const bool fifo = (modeRegister == 0x06 && pointer == 0x05) ||
                      (modeRegister == 0x09 && pointer == 0x07);
    if (fifo) ++fifoRequests;
    if (fifo && fifoErrorAfterConsumption && fifoRequests == 1) {
      // ESP32 reports zero on any I2C error, even after hardware consumed bytes.
      const auto readPointer = modeRegister == 0x06 ? 0x04 : 0x06;
      ++regs[readPointer];
      return 0;
    }
    int count = fifo && shortFifo && fifoRequests == 1 ? length - 1 : length;
    for (int i = 0; i < count; ++i) {
      uint8_t value = regs[uint8_t(pointer + i)];
      if (configured && pointer + i == mismatchReg) value ^= 1;
      rx.push_back(value);
    }
    return count;
  }
  int available() { return static_cast<int>(rx.size()); }
  int read() { int value = rx.front(); rx.pop_front(); return value; }
};
inline WireFake Wire;
