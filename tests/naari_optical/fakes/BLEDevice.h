#pragma once
#include "Arduino.h"
class BLEServer;
class BLEServerCallbacks {
 public:
  virtual void onConnect(BLEServer*) {}
  virtual void onDisconnect(BLEServer*) {}
};
class BLE2902 {};
class BLECharacteristic {
 public:
  enum { PROPERTY_READ = 1, PROPERTY_NOTIFY = 2, PROPERTY_INDICATE = 4 };
  void setValue(const char*) {}
  void notify() {}
  void addDescriptor(BLE2902*) {}
};
class BLEService {
 public:
  BLECharacteristic characteristic;
  BLECharacteristic* createCharacteristic(const char*, int) { return &characteristic; }
  void start() {}
};
class BLEAdvertising {
 public:
  void start() {}
  void addServiceUUID(const char*) {}
  void setScanResponse(bool) {}
  void setMinPreferred(int) {}
};
class BLEServer {
 public:
  BLEAdvertising advertising;
  BLEService service;
  void setCallbacks(BLEServerCallbacks*) {}
  BLEAdvertising* getAdvertising() { return &advertising; }
  BLEService* createService(const char*) { return &service; }
  void startAdvertising() {}
};
class BLEDevice {
 public:
  inline static BLEServer server;
  static void init(const char*) {}
  static void setMTU(int) {}
  static BLEServer* createServer() { return &server; }
  static BLEAdvertising* getAdvertising() { return &server.advertising; }
  static void startAdvertising() {}
};
