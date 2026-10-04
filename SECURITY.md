# Security and responsible use

## Responsible use

Shakedown is a quality-assurance tool for integrations **you own**.

- It only talks to the PayPal **sandbox**. The sandbox lock refuses any other PayPal host.
- Point it only at your own apps: localhost, your own staging, or a target that serves the Shakedown
  verification token at `/.well-known/shakedown.txt`.
- Never use it against third-party sites, live PayPal accounts, real cards, or other people's support
  agents.
- Your credentials stay on your machine. The hosted demo only tests our own demo store, in our own
  sandbox.

## How it is protected

[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) lists each threat, in the CLI and in the hosted demo,
and the code that stops it, along with the latest dependency audit. [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md)
covers the rules for using Shakedown.

## Reporting a vulnerability

Please report security issues privately through GitHub's private vulnerability reporting on this
repository, not in a public issue. We aim to respond within 7 days and follow a 90-day coordinated
disclosure window.

If you find a problem in a third-party integration while using Shakedown in your own sandbox, report it
privately to that project's maintainers. Share the property and the fix, not an exploit walkthrough.
