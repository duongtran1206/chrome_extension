// content.js
(async function () {
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(iv);
          resolve(el);
        } else if (Date.now() - start > timeout) {
          clearInterval(iv);
          reject(new Error("Timeout waiting for " + selector));
        }
      }, 500);
    });
  }

  try {
    // license check
    const res = await fetch("https://raw.githubusercontent.com/duongtran1206/stc_adv/refs/heads/main/extension.txt");
    const text = await res.text();
    if (text.trim() !== "True") {
      chrome.runtime.sendMessage({ action: "log", msg: "Browser updated => please update script" });
      return;
    }
    chrome.runtime.sendMessage({ action: "log", msg: "Browser version checked !" });

    // wait for iframe to appear (title="Promotion Embed")
    try {
      const iframe = await waitForElement('iframe[title="Promotion Embed"]', 15000);
      if (iframe && iframe.src) {
        chrome.runtime.sendMessage({ action: "log", msg: `Found iframe: ${iframe.src}` });
        chrome.runtime.sendMessage({ action: "open_iframe_tab", url: iframe.src });
      } else {
        chrome.runtime.sendMessage({ action: "log", msg: "Found iframe element but no src" });
      }
    } catch (e) {
      chrome.runtime.sendMessage({ action: "log", msg: "No iframe found: " + e.message });
    }
  } catch (err) {
    chrome.runtime.sendMessage({ action: "log", msg: "content.js error: " + err.message });
  }
})();
