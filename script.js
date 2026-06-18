const logCover = (message, details = {}) => {
  console.log(`[Personal_Web][Cover] ${message}`, details);
};

const initializeCoverPage = () => {
  logCover("Cover page initialized.", {
    journeyEntry: document.querySelector(".journey-hidden-entrance")?.getAttribute("href") || null,
    privateEntry: document.querySelector(".hidden-entrance")?.getAttribute("href") || null,
    clickAnywhereNavigation: false
  });
};

document.addEventListener("DOMContentLoaded", initializeCoverPage);
