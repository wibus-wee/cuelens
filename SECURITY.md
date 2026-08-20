# Security Policy

## Supported versions

During the `0.x` series, only the latest published minor release receives
security fixes. Upgrade to the latest release before reporting a problem that
may already be fixed.

| Version              | Supported |
| -------------------- | --------- |
| Latest `0.x` release | Yes       |
| Older releases       | No        |

## Report a vulnerability

Use **Report a vulnerability** on the repository's Security tab to open a
private report. Include the affected package version, impact, reproduction, and
any known mitigation.

Do not open a public issue or pull request for an undisclosed vulnerability.
The maintainer will acknowledge the report, assess affected versions, and
coordinate a fix and disclosure through the private advisory.

The package does not execute cues by itself. Applications must still treat cue
authorization, synthetic input, network mutations, and user data as host-owned
security boundaries.
