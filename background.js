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
    // addLog("background: opening iframe tab " + msg.url);
    addLog("background: opening new tab ");
    chrome.tabs.create({ url: msg.url, active: true }, (tab) => {
      addLog("background: opened tab id=" + (tab && tab.id));
      // addLog("background: opened tab id=" + (tab && tab.id) + " url=" + msg.url);

      // Wait for tab to complete, then inject a script that clicks the vote button
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tab && tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          addLog("background: tab load complete for id=" + tab.id);

          // Inject a function to find and click the vote button (retries)
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              func: function clickVoteInPage() {
                function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
                function isVisible(el) {
                  if (!el) return false;
                  const st = window.getComputedStyle(el);
                  if (!st) return false;
                  if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return false;
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
                }
                // return object with status and debug fields
                return (async () => {
                  // give framework some extra time to render dynamic content
                  await sleep(1000);

                  const start = Date.now();
                  const timeout = 25000; // total 25s
                  let tried = [];

                  while (Date.now() - start < timeout) {
                    try {
                      // try direct class selector first (your exact button)
                      const selector = 'button.voting-button.ssButton.ssButtonPrimary.vote-button';
                      let btn = document.querySelector(selector);
                      if (!btn) {
                        // alternative selectors if class order differs
                        btn = document.querySelector('button.voting-button') ||
                              document.querySelector('button.vote-button') ||
                              Array.from(document.querySelectorAll('button')).find(b => {
                                const t = (b.textContent || "").replace(/\s+/g, "").toLowerCase();
                                return t.includes("vote") && !t.includes("share");
                              });
                      }

                      if (btn && isVisible(btn) && !btn.disabled) {
                        try {
                          // scroll into view, highlight for debug
                          try { btn.scrollIntoView({ behavior: "smooth", block: "center" }); } catch(e){}
                          try { btn.style.outline = "3px solid #0f0"; } catch(e){}

                          // wait a moment so view settles
                          await sleep(500);

                          // dispatch realistic events then click
                          btn.focus && btn.focus();
                          ["pointerover","mouseover","pointerdown","mousedown","mouseup","click"].forEach(type => {
                            try {
                              btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                            } catch(e){}
                          });

                          // small delay to let any handlers run
                          await sleep(300);
                          return { status: "clicked", html: (btn.outerHTML || "").slice(0, 400) };
                        } catch (errClick) {
                          // fallback to .click()
                          sleep(3);
                          try { btn.click();
                            
                             return { status: "clicked_native", html: (btn.outerHTML || "").slice(0,400) }; }
                          catch (ee) { /* continue retries */ }
                        }
                      } else {
                        // gather debug list of button texts
                        const all = Array.from(document.querySelectorAll('button, a')).map(e => (e.textContent||"").trim().slice(0,120));
                        tried = all.slice(0,50);
                      }
                    } catch (inner) {
                      // ignore and retry
                    }
                    await sleep(700);
                  }

                  // timed out
                  return { status: "not_found", triedButtons: tried };
                })();
              }
            },
            (injectionResults) => {
              if (chrome.runtime.lastError) {
                addLog("background: script injection error: " + chrome.runtime.lastError.message);
                return;
              }
              const result = (injectionResults && injectionResults[0] && injectionResults[0].result) || null;
              addLog("background: injected click script result: " + JSON.stringify(result));
              if (result && result.status && result.status.startsWith("clicked")) {
              addLog("background: closing iframe tab id=" + tab.id);
              addLog("Complete Voted at " + `[${new Date().toISOString()}]`);
              chrome.tabs.remove(tab.id);
            }
            }
          );

          

        }
      });
    });
    return;
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
