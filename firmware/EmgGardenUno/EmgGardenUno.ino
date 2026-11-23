#include <Arduino.h>
#include <avr/interrupt.h>

#if !defined(__AVR_ATmega328P__) || F_CPU != 16000000UL
#error "This sketch targets a 16 MHz ATmega328P Arduino Uno."
#endif

// Set a measured AVcc reference to report volts. Zero streams ADC counts.
#ifndef EMG_ADC_REFERENCE_MV
#define EMG_ADC_REFERENCE_MV 0
#endif

// Counts-only bench mode leaves the reference unknown for timing and rail checks.
#ifndef EMG_BENCH_CAPTURE
#define EMG_BENCH_CAPTURE 0
#endif

constexpr bool kBenchCapture = EMG_BENCH_CAPTURE != 0;
constexpr uint16_t kReferenceMv = EMG_ADC_REFERENCE_MV;
static_assert(EMG_ADC_REFERENCE_MV == 0 ||
              (EMG_ADC_REFERENCE_MV >= 1000 && EMG_ADC_REFERENCE_MV <= 5500),
              "The ADC reference must be expressed in millivolts.");

constexpr uint16_t kSampleRate = 2000;
constexpr uint16_t kAdcMax = 1023;
constexpr unsigned long kBaud = 250000;
constexpr uint8_t kTimerPrescale = 8;
constexpr uint16_t kTimerTop = F_CPU / kTimerPrescale / kSampleRate - 1;
constexpr uint8_t kPacketSamples = 40;
constexpr uint8_t kRingSize = 128;
constexpr uint8_t kRingMask = kRingSize - 1;

struct AdcSample {
  uint32_t index;
  uint16_t value;
};

volatile AdcSample samples[kRingSize];
volatile uint8_t head = 0;
volatile uint8_t tail = 0;
volatile uint32_t nextIndex = 0;
volatile uint32_t conversionIndex = 0;
volatile bool conversionPending = false;

uint16_t packet[kPacketSamples];
uint8_t packetLength = 0;
uint32_t packetStart = 0;

ISR(TIMER1_COMPA_vect) {
  // Count every scheduled conversion, even if that slot has to be skipped.
  const uint32_t index = nextIndex++;
  if (conversionPending) return;
  conversionIndex = index;
  conversionPending = true;
  ADCSRA |= _BV(ADSC);
}

ISR(ADC_vect) {
  const uint16_t value = ADC;
  const uint8_t next = (head + 1) & kRingMask;
  if (next != tail) {
    samples[head].index = conversionIndex;
    samples[head].value = value;
    head = next;
  }
  conversionPending = false;
}

bool takeSample(AdcSample &sample) {
  const uint8_t slot = tail;
  if (slot == head) return false;
  // The ISR leaves each occupied slot intact until the reader advances tail.
  sample.index = samples[slot].index;
  sample.value = samples[slot].value;
  tail = (slot + 1) & kRingMask;
  return true;
}

void sendPacket() {
  Serial.print(F("{\"sampleRate\":"));
  Serial.print(kSampleRate);
  Serial.print(F(",\"adcMax\":"));
  Serial.print(kAdcMax);
  if (kBenchCapture) {
    Serial.print(F(",\"referenceV\":null,\"mode\":\"bench_counts\""));
  } else if (kReferenceMv == 0) {
    Serial.print(F(",\"referenceV\":null,\"mode\":\"adc_counts\""));
  } else {
    Serial.print(F(",\"referenceV\":"));
    Serial.print(kReferenceMv / 1000.0, 3);
  }
  Serial.print(F(",\"startIndex\":"));
  Serial.print(packetStart);
  Serial.print(F(",\"samples\":["));
  for (uint8_t i = 0; i < packetLength; ++i) {
    if (i) Serial.print(',');
    Serial.print(packet[i]);
  }
  Serial.println(F("]}"));
  packetLength = 0;
}

void setup() {
  Serial.begin(kBaud);

  noInterrupts();
  ADMUX = _BV(REFS0); // AVcc reference, right-aligned ADC0 result.
  DIDR0 |= _BV(ADC0D);
  ADCSRB = 0;
  ADCSRA = _BV(ADEN) | _BV(ADIE) | _BV(ADIF) |
           _BV(ADPS2) | _BV(ADPS1) | _BV(ADPS0);

  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = kTimerTop;
  TIFR1 = _BV(OCF1A);
  TIMSK1 = _BV(OCIE1A);
  TCCR1B = _BV(WGM12) | _BV(CS11);
  interrupts();
}

void loop() {
  AdcSample sample;
  while (takeSample(sample)) {
    // End the current packet before a gap so the next startIndex exposes it.
    if (packetLength && sample.index != packetStart + packetLength) sendPacket();
    if (!packetLength) packetStart = sample.index;
    packet[packetLength++] = sample.value;
    if (packetLength == kPacketSamples) sendPacket();
  }
}
