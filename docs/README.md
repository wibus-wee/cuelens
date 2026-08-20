# Installed documentation

This directory ships inside `@wibus/interactive-film` so a developer or coding
agent can understand the dependency without opening the repository website.

## Recommended reading order

| Order | Document                                                                                     | Read it for                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | [`usage.md`](usage.md)                                                                       | Public entry points, complete integration patterns, runtime semantics, host responsibilities, and deterministic tests. |
| 2     | [`architecture/interactive-onboarding-film.md`](architecture/interactive-onboarding-film.md) | Why the runtime has these boundaries, the original Lody case study, and the proposed visual Creator architecture.      |
| 3     | `exec-plans/`                                                                                | Historical implementation context only. These plans are not current API contracts.                                     |

For implementation decisions, treat `usage.md` and the emitted TypeScript
declarations as authoritative. Treat the architecture document as design
context. Source code remains the final reference for behavior not covered by a
public contract.

In an installed package, this index is located at:

```text
node_modules/@wibus/interactive-film/dist/docs/README.md
```
