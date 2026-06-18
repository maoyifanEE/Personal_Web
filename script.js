const logCover = (message, details = {}) => {
  console.log(`[Personal_Web][Cover] ${message}`, details);
};

const initializeCoverEntry = () => {
  const cover = document.querySelector("[data-cover-entry]");

  if (!cover) {
    logCover("Cover entry skipped because no cover container was found.");
    return;
  }

  cover.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, textarea, select, label")) {
      logCover("Cover click ignored for interactive element.", {
        tagName: event.target.tagName
      });
      return;
    }

    logCover("Navigating from cover page to journey page.");
    window.location.href = "./journey.html";
  });

  logCover("Cover page initialized.", {
    journeyTarget: "./journey.html"
  });
};

document.addEventListener("DOMContentLoaded", initializeCoverEntry);
