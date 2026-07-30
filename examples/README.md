# Examples

Examples demonstrate framework inputs and contracts, never example applications.

- `minimal-project.json`: only required inputs.
- `constrained-project.json`: repeatable technology-neutral constraints.

Generate into a temporary directory and validate:

```bash
./scripts/create-project --input examples/minimal-project.json --output /tmp/genesis-example
./scripts/validate-planning /tmp/genesis-example
```

Generated output is omitted from version control to avoid duplicating templates and
engine behavior. End-to-end tests generate and inspect it on every validation run.
