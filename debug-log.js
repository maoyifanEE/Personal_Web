(function () {
  const output = document.querySelector("[data-debug-output]");
  const status = document.querySelector("[data-debug-status]");

  const setStatus = (message, isError = false) => {
    if (status) {
      status.textContent = message;
      status.classList.toggle("is-error", isError);
    }
  };

  const render = () => {
    if (!window.PersonalWebDebug) {
      setStatus("调试日志模块未加载。", true);
      return;
    }
    const entries = window.PersonalWebDebug.entries();
    if (output) {
      output.textContent = JSON.stringify(entries.slice(-120), null, 2);
    }
    setStatus(`已读取 ${entries.length} 条本地日志，当前显示最近 ${Math.min(entries.length, 120)} 条。`);
    window.PersonalWebDebug.log("info", "debug_page.rendered", { entryCount: entries.length });
  };

  document.addEventListener("click", async (event) => {
    const action = event.target?.dataset?.debugAction;
    if (!action || !window.PersonalWebDebug) {
      return;
    }
    try {
      if (action === "refresh") {
        render();
      } else if (action === "export") {
        window.PersonalWebDebug.exportLogs();
      } else if (action === "send") {
        setStatus("正在发送到本地后端调试端点...");
        const result = await window.PersonalWebDebug.sendToBackend({ source: "debug-log-page" });
        setStatus(`已发送到本地后端：${result.entryCount} 条。`);
      } else if (action === "clear") {
        window.PersonalWebDebug.clear();
        render();
      }
    } catch (error) {
      setStatus(`操作失败：${error.message}`, true);
      window.PersonalWebDebug.log("warn", "debug_page.action_failed", {
        action,
        error: error.message
      });
    }
  });

  render();
})();
