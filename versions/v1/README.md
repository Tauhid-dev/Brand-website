# v1 Contract

Status: **Current and stable**.

v1 accepts `name`, `description`, and optional string `constraints`. It emits the
layout and machine contracts under `schemas/`, runs sixteen engines, produces eleven
Mermaid/SVG views, and exposes `init`, `regenerate`, `validate`, and `next` commands.

Compatible additions may appear in 1.x when they do not remove fields, paths, commands,
states, or required behavior. Consumers must ignore unknown optional fields.
