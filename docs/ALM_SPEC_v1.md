# ALM v1 — Specification

## 1. Overview
ALM v1 is a binary container protocol designed for deterministic transport across arbitrary mediums (image, QR, audio, file).

It defines:
- A fixed 16-byte header
- A binary payload
- CRC32 integrity validation
- Type-based routing

---

## 2. Packet Structure

[ HEADER (16 bytes) ][ PAYLOAD (N bytes) ]

---

## 3. Header Layout

| Offset | Size | Field     | Type     | Description |
|--------|------|-----------|----------|-------------|
| 0      | 1    | version   | uint8    | Protocol version (1) |
| 1      | 1    | type      | uint8    | Routing type |
| 2      | 4    | length    | uint32LE | Payload size |
| 6      | 4    | meta      | uint32LE | Context-dependent |
| 10     | 4    | checksum  | uint32LE | CRC32(payload) |
| 14     | 2    | reserved  | uint16LE | Must be 0 |

---

## 4. Types

| Type | Meaning  |
|------|----------|
| 0x02 | PROGRAM  |
| 0x03 | TEXT     |
| 0x04 | FREQ     |
| 0x05 | QR       |

---

## 5. Integrity Rules

- checksum MUST match CRC32(payload)
- mismatch = reject packet
- no fallback decoding allowed

---

## 6. Execution Model

ALM is a routing protocol only:

packet → validate → route → module

ALM does NOT interpret payload meaning.
