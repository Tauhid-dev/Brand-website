# Contributing

Changes to Project Genesis must preserve its generic, deterministic, and
resumable nature.

## Required workflow

1. State the contract or defect being changed.
2. Add or update tests before considering the change complete.
3. Update templates, schemas, documentation, examples, and migrations when the
   public contract changes.
4. Run `./scripts/validate-framework`.
5. Use a Conventional Commit-style message with a focused scope.

## Review checklist

- No project-specific product or technology assumption was introduced.
- User-controlled paths remain confined to the requested output directory.
- Generated content is stable across repeated runs.
- Errors are actionable and do not expose secrets.
- New dependencies are justified and pinned where appropriate.
- Security, privacy, accessibility, operations, and rollback were considered.
- Cross-references resolve and memory still identifies one next action.

Breaking schema, CLI, template, or generated-layout changes require a major
version and a migration guide. Backward-compatible capabilities require a minor
version. Backward-compatible corrections require a patch version.
