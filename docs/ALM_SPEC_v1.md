# ALM CORE SPEC v1

## Overview

ALM (Abstract Layered Messaging) is a minimal binary protocol for transporting structured payloads across arbitrary mediums.

ALM defines:
- A fixed binary header (16 bytes)
- A payload (binary)
- A checksum (CRC32)

The protocol is transport-agnostic.

---

## Packet Structure

| Offset | Size | Field     | Description              |
|--------|------|----------|--------------------------|
| 0      | 1    | version  | Protocol version (1)     |
| 1      | 1    | type     | Payload type             |
| 2      | 4    | length   | Payload length (bytes)   |
| 6      | 4    | meta     | Metadata (type-specific) |
| 10     | 4    | checksum | CRC32(payload)           |
| 14     | 2    | reserved | Reserved (0)             |
| 16     | N    | payload  | Raw bytes                |

---

## Types

### 0x02 — PROGRAM
- Payload: UTF-8 encoded source code
- Meta: optional flags
- Example: "1 + 2 * 3"

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
  1915265
  19757432

---

### 0x05 — QR
- Payload: UTF-8 text
- Meta: optional
- Example: arbitrary string

---

### 0x06 — FILE (Reserved)
- Payload: arbitrary binary file
- Meta: optional (future: MIME/type flags)

---

## Payload Rules

- Payload MUST be treated as raw bytes
- No encoding assumptions at protocol level
- Interpretation is responsibility of the handler

---

## Checksum

- Algorithm: CRC32
- Input: payload only (not header)
- Stored at offset 10 (little-endian)

Validation rule:
