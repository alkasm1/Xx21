# ALM CORE SPEC v1

## Overview

ALM (Abstract Layered Messaging) is a minimal binary container protocol for transporting structured data across arbitrary mediums.

It provides:

- A fixed binary packet structure  
- Payload integrity via checksum  
- Type-based routing  
- Transport independence  

ALM does **NOT** define how data is transported or interpreted.

---

## Packet Structure

Every ALM packet consists of:
---

## Header Layout (16 bytes)

| Offset | Size | Field     | Description              |
|--------|------|-----------|--------------------------|
| 0      | 1    | version   | Protocol version (1)     |
| 1      | 1    | type      | Payload type             |
| 2      | 4    | length    | Payload length (bytes)   |
| 6      | 4    | meta      | Type-specific metadata   |
| 10     | 4    | checksum  | CRC32(payload)           |
| 14     | 2    | reserved  | Must be 0                |
| 16     | N    | payload   | Raw bytes                |

---

## Endianness

All multi-byte integers are **little-endian**.

---

## Types

### 0x02 — PROGRAM
- Payload: UTF-8 encoded source code  
- Meta: optional flags  
- Example: `"1 + 2 * 3"`

---

### 0x03 — AUDIO
- Payload: raw audio file bytes (e.g. WAV)  
- Meta: sample rate (Hz), e.g. 8000  
- Notes:  
  - Kernel does NOT interpret audio  
  - Receiver MAY use meta for playback configuration  

---

### 0x04 — FREQ
- Payload: UTF-8 text  
- Meta: optional  
- Example:
---

### 0x05 — QR
- Payload: UTF-8 text  
- Meta: optional  

---

### 0x06 — FILE (Reserved)
- Payload: arbitrary binary file  
- Meta: optional (future use)  

---

## Payload Rules

- Payload MUST be treated as raw bytes  
- No encoding assumptions at protocol level  
- Interpretation is responsibility of the handler  

---

## Checksum

- Algorithm: CRC32  
- Polynomial: `0xEDB88320`  
- Input: payload only (NOT header)  

Validation rule:

If validation fails:  
→ Packet MUST be rejected

---

## Transport Requirements

Any ALM transport (e.g. Xx21, QR, Audio, etc.) MUST:

1. Accept `Uint8Array` as input  
2. Return `Uint8Array` as output  
3. Preserve ALL bytes exactly (byte-perfect)  
4. Pass roundtrip validation:

---

## Kernel Responsibilities

The ALM kernel MUST:

- Construct valid packets (wrap)  
- Validate checksum (unwrap)  
- NOT interpret payload semantics  
- Remain transport-agnostic  

---

## Execution Model

---

## Non-Goals

ALM does NOT define:

- Compression  
- Encryption  
- Encoding (base64, etc.)  
- Transport medium  
- Rendering logic  
- Execution logic (VM, Audio, etc.)  

---

## Versioning

- Current version: **1**  
- Stored in byte 0  
- Changing version implies breaking change  
- Future versions MUST maintain compatibility awareness  

---

## Summary

ALM provides:

- Fixed binary contract  
- Type-based routing  
- Byte-perfect transport guarantee  
- Zero semantic coupling  

This makes ALM suitable as a foundation for:

- Messaging systems  
- Binary transport layers  
- Cross-medium data exchange  
- Experimental runtime systems
