# Kestrel Case Study

**Real application** — Kestrel, an AI service call agent (Python/FastAPI),
evaluated at frozen commit `5e65843fddfe5f907485b798e464ad37b3b3b2c7`.

## Result

Decision **REVIEW** — 44 consequential action paths, Code Capable 44/44.

## Consequence labels are exact sink operations

Labels describe the actual operation at the frozen source line — not handler
names, not file names:

- `tool_handlers.py:220` — `orders.insert(...)` → **ORDER RECORD WRITE**
- `lifecycle_tracker.py:117` — `call_lifecycle.insert(...)` → **CALL LIFECYCLE RECORD WRITE**
- `lifecycle_tracker.py:43` — `call_lifecycle.select(*).limit(1)` → **CALL LIFECYCLE TABLE READ**
- `transactional_sms.py:190` — `sms_messages.select("id","created_at")` → **CUSTOMER MESSAGE RECORDS READ** (rate-limit read — not a send)
- `calendar_service.py:50` — `ai_agent_configs.select("timezone")` → **TENANT TIMEZONE CONFIG READ**
- `template_schema.py:1140` — `locations.select(...)` → **LOCATION CONFIG READ**
- `template_schema.py:1294` — `ai_config_templates.select(...)` → **TEMPLATE CONFIG READ**
- `tool_handlers.py:252` — `menu_items.select(...)` → **MENU ITEMS READ**

`RESOURCE_NAME != EFFECT_VERB`. `MESSAGE_RESOURCE != MESSAGE_SEND`.

## What was deliberately not claimed

No authorization, effective permission, execution, or completed transaction
was established from the static evaluation — those planes read NOT_ASSESSED.
The frontier (555 items) is shown, not hidden.

## Artifacts

`demo/kestrel/` — three report profiles (PDF), sanitized public JSON,
machine JSON, SHA-256 manifest, canonical Decision Receipt, and Passport.
