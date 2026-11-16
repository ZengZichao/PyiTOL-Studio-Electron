# Security Policy

## Supported versions

Only the latest release line is supported. Security fixes are made to
`main` and released as a patch of the current minor. Older releases do not
receive backports; upgrade to the latest release instead.

## Reporting a vulnerability

Please use **GitHub's private vulnerability reporting** for this repository
(Security tab → "Report a vulnerability"). That keeps the report, the
discussion and the fix coordination out of the public issue tracker until a
release is ready.

If private reporting is unavailable for some reason, email
**zengzichao@sjtu.edu.cn** with `[PyiTOL Studio security]` in the subject.
Please do not open a public issue for anything you believe is exploitable.

You can expect an initial response within **7 days**. If the report is
accepted, the fix lands on `main`, a patch release is cut, and the reporter
is credited in the release notes unless they ask otherwise.

## Scope

In scope:

- The Electron main/renderer security baseline: `contextIsolation`,
  `nodeIntegration: false`, sandboxed renderer, CSP, and the typed preload
  bridge. A bypass that reaches Node APIs from renderer content is a
  security report.
- The sidecar stdio JSON-RPC protocol: crafted responses or project files
  that escape the intended working directory, spawn unexpected processes, or
  corrupt files outside the user's intent. Project files (`.pyitolproj`)
  and annotation templates are untrusted input.
- iTOL credential handling: the API key must never be written to logs,
  crash reports, or the repository. A path that leaks it is a security
  report.
- Auto-update integrity: `electron-updater` manifests and artefacts must be
  signature-checked; a downgrade or spoofing path is in scope.

Out of scope:

- Vulnerabilities in third-party dependencies that have no exploit path in
  this app; report them upstream.
- Local attacks that require the attacker to already control the user's
  session.

## Best Practices for Contributors

- Do not disable `contextIsolation`, `sandbox`, or CSP.
- Do not pass raw HTML from project/template data into `dangerouslySetInnerHTML`.
- Do not log API keys, tokens, or full file paths from untrusted input.
- Keep dependencies pinned in `package-lock.json` and review lockfile
  changes in review.
