# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities by emailing:

**compliance@localfalcon.com**

Include `MCP Security` in the subject line so the report routes correctly.

**Do not file public GitHub issues** for vulnerabilities — they are publicly
visible and would expose users before a fix can ship.

## What to Include

To help us triage quickly, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept if available
- The affected endpoint, transport, or component
- Any suggested mitigation, if you have one
- Whether you have shared the report with anyone else

## Our Commitment

- **Acknowledgment within 3 business days** of receipt
- **Initial assessment within 7 business days**
- **Coordinated disclosure timeline** established with the reporter, sized to
  the severity and complexity of the fix
- We will keep you informed as remediation progresses
- With your permission, we will credit you in the release notes once a fix
  has shipped

## Supported Versions

Security fixes target the **latest published version of `@local-falcon/mcp` on
npm**. Older versions are not maintained — please update before reporting an
issue you've only reproduced on an older release.

## Out of Scope

- Vulnerabilities in upstream dependencies that have not yet been addressed by
  their maintainers (please report those upstream first)
- Issues that require an attacker to already control the user's machine, npm
  registry, or GitHub account
- Self-XSS in widgets that depends on user-pasted content
- Rate-limiting, abuse, or denial-of-service issues against the public Local
  Falcon API itself — those go through the platform's standard support channel,
  not this MCP server's security policy

Thank you for helping keep Local Falcon and its users safe.
