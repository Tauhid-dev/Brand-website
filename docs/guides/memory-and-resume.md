# Memory and Resume Protocol

Generated repositories combine narrative files with `memory/state.json`. Narrative
explains why; machine state gives one unambiguous cursor.

## Resume after any pause

1. Validate the repository and manifest.
2. Read constitution, current state, decision summary, risks, and handoff.
3. Read the `current_chunk` from machine state and its complete work packet.
4. Confirm dependencies and required reading.
5. Execute only the declared scope.

## End a session

Update completion evidence, decisions, risks, debt, progress, status, current state,
session handoff, chunk states, and exactly one next action. Commit evidence with the work.

## State transitions

`planned → ready → in_progress → verified → complete`. Work may become `blocked`; the
record names the failed condition and exact authority or external state needed. A
resolved block returns to `ready`, not directly to complete.

## Long-pause guarantee

If a new engineer can validate, identify the current chunk, understand decisions and
risks, reproduce existing evidence, and perform the next action without chat, the memory
contract is satisfied.
