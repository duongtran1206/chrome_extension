// background.js
function getNextEasternTargetTime(hour, minute) {
  const now = new Date();

  // Current time in ET
  const nowETStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const nowET = new Date(nowETStr);

  // Build target time in ET
  const targetET = new Date(nowET);
  targetET.setHours(hour, minute, 0, 0);

  addLog(`[DEBUG] Now Local=${now.toString()} | Now ET=${nowET.toString()}`);
  addLog(`[DEBUG] Target ET initial=${targetET.toString()}`);

  // If target already passed, schedule tomorrow
  if (targetET <= nowET) {
    targetET.setDate(targetET.getDate() + 1);
    addLog("[DEBUG] Target ET was in the past → moved to tomorrow");
  } else {
    addLog("[DEBUG] Target ET is still ahead today");
  }

  return targetET;
}
function getRandomHourMinuteInRange(startHour, endHour) {
  const hour = Math.floor(Math.random() * (endHour - startHour + 1)) + startHour;
  const minute = Math.floor(Math.random() * 60);
  return { hour, minute };
}
function scheduleVoteAt9_50ET() {
  const { hour, minute } = getRandomHourMinuteInRange(9, 21);
  const target = getNextEasternTargetTime(hour, minute);

  chrome.alarms.create("Vote", {
    when: target.getTime(),
    periodInMinutes: 24 * 60 // repeat daily
  });

  addLog(
    `Alarm Vote scheduled at Local=${new Date(target).toString()} | ` +
    `ET=${target.toLocaleString("en-US", { timeZone: "America/New_York" })}`
  );
}

// On install/update
chrome.runtime.onInstalled.addListener(() => {
  addLog("Extension installed/updated → scheduling daily ");
  scheduleVoteAt9_50ET();
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  addLog("Browser startup → scheduling daily ");
  scheduleVoteAt9_50ET();
});

// Handle scheduled alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "Vote") {
    addLog("Alarm fired: " + alarm.name);

    chrome.tabs.create({
      url: "https://www.bestofbk.com/voting/#/gallery/503259289/",
      active: true
    }, (tab) => {
      addLog("Vote tab opened, id=" + (tab && tab.id));
    });
  }
});


const DOWNLOAD_FILENAME = "vote_logs.txt";

function saveLogLine(line) {
  chrome.storage.local.get({ logs: [] }, (data) => {
    const logs = data.logs || [];
    logs.push(line);
    chrome.storage.local.set({ logs });
  });
}

// Unified logger for other parts to call via message
function addLog(msg) {
  const now = new Date();

  // Eastern time string
  const nowET = now.toLocaleString("en-US", { 
    timeZone: "America/New_York", 
    hour12: false 
  });

  const line = `[ET=${nowET}] ${msg}`;

  console.log(line);
  saveLogLine(line);
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Simple logging messages
  if (msg && (msg.action === "log" || msg.action === "save_log")) {
    addLog(msg.msg || msg.log || msg.data || "log");
    return;
  }
  if (msg.action === "open_vote") {
    chrome.tabs.create(
      {
        url: "https://www.bestofbk.com/voting/#/gallery/503259289/",
        active: true
      },
      (tab) => {
        if (tab) {
          addLog("Vote tab opened, id=" + tab.id); // assuming addLog is defined in background
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
      }
    );
    return true; // IMPORTANT: keeps sendResponse alive for async
  }
  // Open iframe tab handler (keeps previous behavior)
if (msg && msg.action === "open_iframe_tab" && msg.url) {
    // addLog("background: received open_iframe_tab for " + msg.url);

    const tabId = sender?.tab?.id;
    if (!tabId) {
      addLog("background: no sender tab id found");
      return;
    }

    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        addLog("background: tab load complete for id=" + tabId);

        // --- Extract entry id correctly ---
        const parts = msg.url.split("/").filter(Boolean);
        const ENTRY_ID = parts[parts.length - 1]; // e.g. "503259289"
        const MATCHUP_ID = 5629821;

        addLog("background: extracted ENTRY_ID = " + ENTRY_ID);

        (async () => {
          const API_BASE = "https://embed-1113282.secondstreetapp.com/api";
          const AUTH = "fccd2c8f381a0338";
          const X_FINGERPRINT = "2afeb560bc2f50073ce4de552ee65012";
          const X_API_KEY = "65032887";
          const ORG_ID = "1718";
          const ORG_PROMO = "1113282";
          const PROMO_ID = "950800";

          function mkHeaders(extra = {}) {
            return Object.assign({
              "accept": "*/*",
              "content-type": "application/json; charset=UTF-8",
              "authorization": AUTH,
              "x-api-key": X_API_KEY,
              "x-fingerprint": X_FINGERPRINT,
              "x-organization-id": ORG_ID,
              "x-organization-promotion-id": ORG_PROMO,
              "x-promotion-id": PROMO_ID,
              "x-referring-url": msg.url,
              "Referer": msg.url
            }, extra);
          }

          try {
            // 1) Find existing votes
            const q = `${API_BASE}/votes?matchup_entry_id=${encodeURIComponent(ENTRY_ID)}`;
            // addLog("background: checking existing votes " + q);

            const r = await fetch(q, { method: "GET", headers: mkHeaders(), credentials: "include" });
            const txt = await r.text();
            let existing;
            try { existing = JSON.parse(txt); } catch(e) { existing = txt; }
            // addLog("background: GET votes response " + r.status + " " + JSON.stringify(existing));

            let voteIds = [];
            if (Array.isArray(existing)) {
              voteIds = existing.map(v => v.id).filter(Boolean);
            } else if (existing?.data && Array.isArray(existing.data)) {
              voteIds = existing.data.map(v => v.id).filter(Boolean);
            } else if (existing?.votes && Array.isArray(existing.votes)) {
              voteIds = existing.votes.map(v => v.id).filter(Boolean);
            }

            // 2) Delete old votes if any
            for (const id of voteIds) {
              try {
                const delUrl = `${API_BASE}/votes/${id}`;
                const dr = await fetch(delUrl, { method: "DELETE", headers: mkHeaders(), credentials: "include" });
                const dt = await dr.text();
                // addLog(`background: DELETE ${id} => ${dr.status} ${dt}`);
              } catch (e) {
                addLog("background: error deleting " + id + " " + e);
              }
            }

            // 3) Post new vote
            const body = {
              votes: [
                {
                  date_created: null,
                  date_modified: null,
                  matchup_id: MATCHUP_ID,
                  status_type_id: null,
                  __force_dirty: null,
                  matchup_entry_id: Number(ENTRY_ID)
                }
              ]
            };

            // addLog("background: posting body=" + JSON.stringify(body));

            const res = await fetch(`${API_BASE}/votes`, {
              method: "POST",
              headers: mkHeaders(),
              body: JSON.stringify(body),
              credentials: "include"
            });

            const postTxt = await res.text();
            // addLog("background: POST response " + res.status + " " + postTxt);

            if (res.ok) {
              addLog("✅ Vote posted successfully for entry " + ENTRY_ID);
            } else {
              addLog("❌ Vote POST failed " + res.status);
            }
          } catch (err) {
            addLog("background: error " + err);
          }
        })();
      }
    });
  }




  // DOWNLOAD LOG request (from popup)
  if (msg && msg.action === "download_log") {
    // async response — we will call sendResponse later
    (async () => {
      try {
        chrome.storage.local.get({ logs: [] }, (data) => {
          const logs = data.logs || [];
          const content = logs.join("\n") || "(no logs)";
          // Create blob + object URL
          try {
            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);

            chrome.downloads.download({ url, filename: DOWNLOAD_FILENAME }, (downloadId) => {
              if (chrome.runtime.lastError) {
                console.error("download failed:", chrome.runtime.lastError);
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
                // revoke URL anyway
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              } else {
                sendResponse({ ok: true, downloadId });
                // revoke URL after a short delay
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }
            });
          } catch (errBlob) {
            console.error("blob/createObjectURL error:", errBlob);
            // fallback to data URL (small logs only)
            const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
            chrome.downloads.download({ url: dataUrl, filename: DOWNLOAD_FILENAME }, (downloadId) => {
              if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              } else {
                sendResponse({ ok: true, downloadId });
              }
            });
          }
        });
      } catch (e) {
        console.error("download_log handler error:", e);
        sendResponse({ ok: false, error: e.message });
      }
    })();

    return true; // tells Chrome we'll call sendResponse asynchronously
  }
});
