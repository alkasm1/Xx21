# ALM Specification — Version 1.0
Abstract Layered Messaging Protocol (ALM)

Author: Brhom  
Status: Stable  
Last Updated: 2026-05-01

---

# 1. Overview

ALM هو بروتوكول مراسلة ثنائي (Binary Messaging Protocol) مصمم ليكون:

- سريع (Low‑latency)
- خفيف (Low‑overhead)
- آمن (HMAC)
- قابل للتنفيذ على أي منصة (Transport‑agnostic)
- مناسب للأنظمة الموزعة (Distributed Control Systems)
- قابل للتوسّع (Extensible Commands)

ALM v1 هو الأساس الذي بُني عليه نظام Xx21 Control Plane.

---

# 2. Packet Structure

كل حزمة ALM تتكون من:

## 2.1 MAGIC
قيمة ثابتة:

## 2.2 VERSION
نسخة البروتوكول:

## 2.3 CMD_ID
معرّف الأمر:
- `0x11` → SetFreq  
- `0x12` → Reboot  
- `0x20` → Scan  
- `0x30` → Custom  

## 2.4 FLAGS
بتات مستقبلية:
- Bit0 → Encrypted  
- Bit1 → Compressed  

## 2.5 DEVICE_ID
رقم الجهاز (0–65535)

## 2.6 PAYLOAD_LENGTH
طول البيانات

## 2.7 PAYLOAD
بيانات ثنائية (Binary)

## 2.8 HMAC
SHA‑256 على كامل الحزمة.

---

# 3. ACK Format

## STATUS
- `0x00` → OK  
- `0x01` → FAIL  

## ERROR_CODE
- `0x00` → No error  
- `0x01` → Invalid payload  
- `0x02` → Permission denied  
- `0x03` → Internal error  

---

# 4. Security Model

## 4.1 HMAC
يستخدم:

## 4.2 Key Rotation
يدعم:
- keyId  
- multiple keys  
- rotation schedule  

---

# 5. Commands

## 5.1 SetFreq (0x11)
Payload:

## 5.2 Reboot (0x12)
Payload:

---

# 6. Transport Independence

ALM يعمل فوق أي Transport:

- UDP  
- WebSocket  
- Canvas (Xx21)  
- Serial  
- BLE  
- LoRa  
- Custom RF  

---

# 7. Xx21 Transport Notes

Xx21 يحول Uint8Array إلى Canvas:

- R = G = B = value  
- A = 255  
- بدون JSON  
- بدون metadata  
- بدون headers إضافية  

---

# 8. Error Handling

- Invalid MAGIC → drop  
- Invalid VERSION → drop  
- Invalid HMAC → drop  
- Unknown CMD_ID → drop  
- Payload too short → drop  

---

# 9. Versioning

ALM v1 ثابت الآن.  
أي تغييرات مستقبلية ستكون في:

- ALM v2  
- ALM Extensions  

---

# 10. Reference Implementation

الملفات الرسمية:

---

# 11. Conclusion

ALM v1 هو بروتوكول بسيط، سريع، آمن، وقابل للتنفيذ على أي منصة.  
يمثل الأساس لكل أنظمة Xx21 وعمليات التحكم الشبكي.





































