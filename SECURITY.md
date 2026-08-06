# Security policy

## Supported versions

botchart is pre-release and nothing is published yet. When releases start, only
the latest release receives fixes.

## Report a vulnerability

Report privately through GitHub. Open
[the security advisory form](https://github.com/svyatov/botchart/security/advisories/new)
and describe the problem there. The report stays private until a fix is published.

Do not open a public issue for a security problem.

Include what you have:

- The version or commit you tested.
- The steps that reproduce the problem.
- What an attacker gains.

You get a first reply within 7 days. If 7 days pass with no reply, open a public
issue that says a security report is waiting and names no detail.

## Scope

The adapter talks to the Telegram Bot API and handles bot tokens, so token
handling, callback data handling, and input validation are all in scope. A report
about the Telegram Bot API itself goes to Telegram, not here.
