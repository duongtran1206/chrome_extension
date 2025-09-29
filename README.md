README — How to load this Chrome extension (Unpacked)

Simple, copy‑pasteable guide to load your extension into Chrome for testing. Includes how to reload, inspect logs (MV2 & MV3), revert to backups, and common troubleshooting.
1 — Prepare the extension folder

Make sure the folder contains:

manifest.json

background.js (or service worker for MV3)

content.js

popup.html

popup.js

any other assets (icons, CSS, etc.)

2 — Load the extension (Unpacked) — step by step

Open Chrome.

Go to chrome://extensions/ (type it in the address bar).

Turn Developer mode on (toggle in the top-right).

Click Load unpacked (top-left).

In the file dialog, select the folder that contains your extension (e.g., C:\submit_work) and click Select Folder.

The extension should appear in the list. If there’s a red error message, click the card to expand details and read the error.

