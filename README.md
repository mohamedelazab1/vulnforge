# VulnForge

A hands-on, capture-the-flag style training platform for learning web vulnerabilities. Each challenge contains **real vulnerable code** running in a safe, isolated environment — no simulations, no abstractions.

## Vulnerabilities Covered (Easy → Expert)

| # | Vulnerability | Difficulty | Real Data Exposed |
|---|--------------|-----------|-------------------|
| 1 | Security Misconfiguration — Debug endpoint leaks .env | Easy | AWS keys, DB creds |
| 2 | Cryptographic Failures — Plaintext passwords in API | Easy | User credentials |
| 3 | Broken Access Control (IDOR) — No auth on user data | Easy | SSH private key |
| 4 | Identification & Authentication Failures — Brute force login | Medium | Admin password |
| 5 | SQL Injection — UNION injection in search | Medium | Credit card numbers |
| 6 | Insecure Design — No validation on transfer | Medium | Balance manipulation |
| 7 | Vulnerable & Outdated Components — XXE via XML parser | Hard | AWS secret key |
| 8 | Software & Data Integrity Failures — Arbitrary file upload | Hard | Webshell upload |
| 9 | Security Logging & Monitoring Failures — PII in logs | Hard | Credit cards in plaintext |
| 10 | Server-Side Request Forgery (SSRF) — Unvalidated fetch URL | Hard | EC2 instance metadata |
| 11 | **Expert Challenge: The Full Chain** — IDOR → Insecure Design → SSRF | **Expert** | Internal vault secret |

## Tech Stack

- **Frontend:** Next.js 14 (React)
- **Backend:** Express.js + SQLite (sql.js)
- **Auth:** JWT tokens

## Quick Start

```bash
# Install dependencies
npm run install:all

# Delete old DB for fresh realistic seed data
rm backend/owasp.db

# Start backend (port 3001) + frontend (port 3000)
npm run dev
```

Open http://localhost:3000 in your browser.

## Challenge Endpoints

| Endpoint | Vulnerability | What leaks |
|----------|--------------|------------|
| `GET /api/debug` | Security Misconfiguration | `.env` vars: AWS keys, DB password, Redis URL |
| `GET /api/user/:id` | IDOR | Any user's profile + notes |
| `POST /api/login` | Auth Failure | Brute-forceable, no rate limit |
| `GET /api/search?q=` | SQL Injection | `credit_cards`, `secrets`, `users` tables |
| `POST /api/transfer` | Insecure Design | Negative amounts accepted |
| `POST /api/parse` | XXE | Read any server file |
| `POST /api/upload` | Integrity Failure | Arbitrary file write |
| `GET /api/logs` | Logging Failure | Plaintext passwords, CC numbers |
| `GET /api/fetch?url=` | SSRF | Internal services, cloud metadata |

## Flag Reference

| Challenge | Flag (what to submit) |
|-----------|----------------------|
| Security Misconfiguration | `AKIAIOSFODNN7EXAMPLE` |
| Cryptographic Failures | `alice:LetMeIn!2024` |
| Broken Access Control | `MHQCAQEEIIm3V+wYzIM6Trds4Rv5fGRpYq4nlcGmhqM3iDk9kWhLoAcGBSuBBAAi` |
| Authentication Failures | `P@ssw0rd!2024` |
| SQL Injection | `4532015112830366` |
| Insecure Design | `$999999.99` |
| Vulnerable Components | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| Integrity Failures | `<?php system($_GET["cmd"]); ?>` |
| Logging Failures | `4111111111111111` |
| SSRF | `ami-0c55b159cbfafe1f0` |
| Expert Chain | `VAULT_SECRET_a1b2c3d4e5` |

## Security Note

This platform is intentionally vulnerable for **educational purposes only**. Do not deploy it publicly or expose it to the internet. Run it only on your local machine for learning.
