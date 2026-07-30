# Migration Protocol

Every major migration provides preflight validation, backup guidance, dry run,
deterministic transformation, post-validation, audit report, rollback or forward-repair,
and resume-state preservation. Never migrate an uncommitted or invalid foundation.

Sequence: validate source → record revision/hash → back up → dry run → review report →
apply → validate target → update version/ADR/memory → retain migration evidence.
