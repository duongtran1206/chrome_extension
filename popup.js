function loadLogs() {
  chrome.storage.local.get({ logs: [] }, (data) => {
    const area = document.getElementById("logArea");
    if (!data.logs || !data.logs.length) {
      area.textContent = "(no logs)";
    } else {
      area.textContent = data.logs.slice(-30).join("\n"); // show last 30 logs
    }
  });
}
document.getElementById("vote").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "open_vote" }, (resp) => {
    if (chrome.runtime.lastError) {
      document.getElementById("status").innerText =
        "Error: " + chrome.runtime.lastError.message;
      return;
    }

    if (resp && resp.ok) {
      document.getElementById("status").innerText = "Vote tab opened.";
    } else {
      document.getElementById("status").innerText = "Failed to open vote tab.";
    }
  });
});

document.getElementById("download").addEventListener("click", () => {
  document.getElementById("status").innerText = "Downloading log...";

  chrome.runtime.sendMessage({ action: "download_log" }, (resp) => {
    if (chrome.runtime.lastError) {
      document.getElementById("status").innerText =
        "Download error: " + chrome.runtime.lastError.message;
      return;
    }

    if (!resp) {
      document.getElementById("status").innerText = "No response from background.";
      return;
    }

    if (resp.ok) {
      document.getElementById("status").innerText =
        "Download started (check your Downloads folder).";
    } else if (resp.fallback && resp.content) {
      // Fallback: create file directly in popup
      const blob = new Blob([resp.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vote_log.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      document.getElementById("status").innerText = "Downloaded (via popup fallback).";
    } else {
      document.getElementById("status").innerText =
        "Download failed: " + (resp.error || "unknown");
    }
  });
});

document.getElementById("clear").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "clear_logs" }, (resp) => {
    if (resp && resp.ok) {
      document.getElementById("status").innerText = "Logs cleared.";
      loadLogs();
    }
  });
});

// Load logs on popup open
loadLogs();
