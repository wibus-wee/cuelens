# Installed documentation

This directory ships inside `@wibus/interactive-film` so a developer or coding
agent can understand the dependency without opening the repository website.

## Recommended reading order

| Order | Document                                                               | Read it for                                                                                                            |
| ----- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | [`install.md`](install.md)                                             | Safe installation workflow and integration decision points for developers and coding agents.                           |
| 2     | [`usage.md`](usage.md)                                                 | Public entry points, complete integration patterns, runtime semantics, host responsibilities, and deterministic tests. |
| 3     | [`architecture/interactive-film.md`](architecture/interactive-film.md) | Runtime boundaries, data flow, camera design, and the proposed visual Creator architecture.                            |

For installation decisions, start with `install.md`. For implementation
decisions, treat `usage.md` and the emitted TypeScript declarations as
authoritative. Treat the architecture document as design context. Source code
remains the final reference for behavior not covered by a public contract.

Historical execution plans are intentionally excluded from published packages.

In an installed package, this index is located at:

```text
node_modules/@wibus/interactive-film/dist/docs/README.md
```
