# Changelog

## Unreleased

- Chat-only mode via `voiceEnabled={false}` / `data-voice-enabled="false"`: a chat FAB replaces the microphone, the floating response bar is hidden, typed messages use `/chat`, and microphone permission is never requested.

## 0.2.0 — GPT-Live and npm distribution

- GPT-Live voice with a GPT-5.6 Luna task backend, hold-to-talk input and idle closure.
- AI-selected action confirmation with optional forced confirmation; removes safe/preview bypass markers.
- Fix duplicate captions and clipped confirmation buttons; preserve viewport placement and session-only visibility.
- Separate client installation from server deployment documentation.
- Public npm packaging and verified-main automatic publication through GitHub Actions OIDC.

Migration: update client and server together. Proxies must allow `/live`; `use_element` now requires `requireConfirmation`.

## 0.1.1 — Packaged documentation

- Include the full tool examples and contribution guide in the installation archive.
- Check relative documentation links inside a clean package installation.

## 0.1.0 — Initial self-hosted alpha

- Standalone server, script bundle and React component; clean-package installation check.
- Push-to-talk FAB, compact response bar, expandable chat and microphone reuse.
- Three observed-screen tools with semantic extraction, privacy exclusions, stale-screen protection, confirmation and bounded replay handling.
- English/Korean configuration, UI overrides, speech language defaults and IANA time zones.
- Authenticated gateway example, server auth hook, body/rate/concurrency limits and metadata-only request logs.
- HTML/React tutorials, real-provider execution video and bilingual documentation.
- Automated Chromium/Firefox/WebKit and mobile-emulation regressions.

Physical mobile microphone verification, additional AI providers, managed-service API keys and billing are not included in this alpha.
