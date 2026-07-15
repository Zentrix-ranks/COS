# Runbook — Model provider outage

**Owner:** Ops Lead · **Severity:** high · Source: spec/15 §9, spec/02 §10, spec/09 §7.

## Detection
- Model calls failing/timing out; `tool_status.breaker_open` for the model tool; runs parked.

## First actions
1. Verify OpenRouter fallback routing is active (doc 09 §7 routes have fallbacks).
2. If all providers are down, pause the operation (kill-switch) so runs hold at checkpoints
   instead of retry-storming; notify.
3. When a provider recovers, the breaker half-opens; resume held/paused runs from checkpoint.

## Verification
- A fresh model node completes via the primary or fallback route; breaker closes on success.
