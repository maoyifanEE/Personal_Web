const logHomepage = (message, details = {}) => {
  console.log(`[Personal_Web][Homepage] ${message}`, details);
};

// Future editor can update this data object.
const HOMEPAGE_TIMELINE_DATA = {
  path: {
    // Future editor can update the SVG control points here.
    desktop: "M 52 2 C 18 10 18 22 46 29 C 78 37 84 47 56 55 C 24 64 24 75 52 82 C 82 90 78 96 50 99",
    mobile: "M 52 2 C 34 13 66 22 50 33 C 34 45 66 55 50 66 C 34 78 66 88 50 99"
  },
  areas: [
    {
      id: "area-01",
      title: "Area 01",
      description: "This is a placeholder description for Area 01.",
      theme: "green",
      order: 1,
      height: 500,
      mobileHeight: 630,
      backgroundVariant: "soft-field"
    },
    {
      id: "area-02",
      title: "Area 02",
      description: "This is a placeholder description for Area 02.",
      theme: "blue",
      order: 2,
      height: 520,
      mobileHeight: 630,
      backgroundVariant: "soft-sky"
    },
    {
      id: "area-03",
      title: "Area 03",
      description: "This is a placeholder description for Area 03.",
      theme: "sand",
      order: 3,
      height: 520,
      mobileHeight: 630,
      backgroundVariant: "soft-sand"
    },
    {
      id: "area-04",
      title: "Area 04",
      description: "This is a placeholder description for Area 04.",
      theme: "purple",
      order: 4,
      height: 540,
      mobileHeight: 630,
      backgroundVariant: "soft-lavender"
    }
  ],
  events: [
    {
      id: "major-01",
      type: "major",
      areaId: "area-01",
      date: "2000",
      title: "Major Event 01",
      description: "This is a test description.",
      imageType: "placeholder",
      pathPosition: 0.1,
      desktop: { x: 48, y: 10, side: "right" },
      mobile: { x: 52, y: 9 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-01",
      type: "minor",
      areaId: "area-01",
      date: "2000",
      title: "Minor Event 01",
      description: "This is a placeholder event.",
      imageType: "placeholder",
      pathPosition: 0.16,
      desktop: { x: 31, y: 17, side: "left" },
      mobile: { x: 42, y: 15 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-02",
      type: "minor",
      areaId: "area-01",
      date: "2005",
      title: "Minor Event 02",
      description: "This is a placeholder description.",
      imageType: "placeholder",
      pathPosition: 0.23,
      desktop: { x: 59, y: 24, side: "right" },
      mobile: { x: 58, y: 22 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "major-02",
      type: "major",
      areaId: "area-02",
      date: "2005",
      title: "Major Event 02",
      description: "This is a placeholder event.",
      imageType: "placeholder",
      pathPosition: 0.34,
      desktop: { x: 72, y: 34, side: "left" },
      mobile: { x: 49, y: 33 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-03",
      type: "minor",
      areaId: "area-02",
      date: "2010",
      title: "Minor Event 03",
      description: "This is a test description.",
      imageType: "placeholder",
      pathPosition: 0.43,
      desktop: { x: 52, y: 43, side: "right" },
      mobile: { x: 60, y: 43 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "major-03",
      type: "major",
      areaId: "area-03",
      date: "2010",
      title: "Major Event 03",
      description: "This is a placeholder description.",
      imageType: "placeholder",
      pathPosition: 0.56,
      desktop: { x: 43, y: 57, side: "right" },
      mobile: { x: 51, y: 56 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-04",
      type: "minor",
      areaId: "area-03",
      date: "2015",
      title: "Minor Event 04",
      description: "This is a placeholder event.",
      imageType: "placeholder",
      pathPosition: 0.64,
      desktop: { x: 26, y: 65, side: "left" },
      mobile: { x: 41, y: 64 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-05",
      type: "minor",
      areaId: "area-03",
      date: "2015",
      title: "Minor Event 05",
      description: "This is a placeholder description.",
      imageType: "placeholder",
      pathPosition: 0.72,
      desktop: { x: 56, y: 72, side: "right" },
      mobile: { x: 61, y: 72 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "major-04",
      type: "major",
      areaId: "area-04",
      date: "2020",
      title: "Major Event 04",
      description: "This is a test description.",
      imageType: "placeholder",
      pathPosition: 0.84,
      desktop: { x: 70, y: 84, side: "left" },
      mobile: { x: 50, y: 84 },
      offset: { x: 0, y: 0 }
    },
    {
      id: "minor-06",
      type: "minor",
      areaId: "area-04",
      date: "2020",
      title: "Minor Event 06",
      description: "This is a placeholder event.",
      imageType: "placeholder",
      pathPosition: 0.92,
      desktop: { x: 52, y: 92, side: "right" },
      mobile: { x: 60, y: 93 },
      offset: { x: 0, y: 0 }
    }
  ]
};

const TIMELINE_BREAKPOINT = 600;

const getAreaById = (areaId) =>
  HOMEPAGE_TIMELINE_DATA.areas.find((area) => area.id === areaId);

const createPlaceholderImage = () => {
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-image";
  placeholder.textContent = "Placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  return placeholder;
};

const renderAreas = (container) => {
  const orderedAreas = [...HOMEPAGE_TIMELINE_DATA.areas].sort(
    (first, second) => first.order - second.order
  );

  container.innerHTML = "";

  orderedAreas.forEach((area, index) => {
    const section = document.createElement("section");
    section.className = "journey-area";
    section.dataset.areaId = area.id;
    section.dataset.theme = area.theme;
    section.dataset.backgroundVariant = area.backgroundVariant;
    section.style.setProperty("--area-height", `${area.height}px`);
    section.style.setProperty("--area-mobile-height", `${area.mobileHeight}px`);
    section.style.setProperty("--area-copy-offset", index % 2 === 0 ? "0" : "52%");

    section.innerHTML = `
      <div class="journey-area__copy">
        <p class="journey-area__index">Area ${String(area.order).padStart(2, "0")}</p>
        <h2>${area.title}</h2>
        <p>${area.description}</p>
      </div>
    `;

    container.append(section);
  });

  logHomepage("Rendered timeline areas.", {
    areaCount: orderedAreas.length,
    areas: orderedAreas.map((area) => area.id)
  });
};

const setEventPosition = (element, event) => {
  const mobileLayout = window.matchMedia(`(max-width: ${TIMELINE_BREAKPOINT}px)`).matches;
  const coordinates = mobileLayout ? event.mobile : event.desktop;

  element.style.setProperty("--event-x", `${coordinates.x}%`);
  element.style.setProperty("--event-y", `${coordinates.y}%`);
  element.style.setProperty("--event-offset-x", `${event.offset.x}px`);
  element.style.setProperty("--event-offset-y", `${event.offset.y}px`);
  element.dataset.side = mobileLayout ? "center" : event.desktop.side;
};

const renderEvents = (container) => {
  container.innerHTML = "";

  HOMEPAGE_TIMELINE_DATA.events.forEach((event) => {
    const area = getAreaById(event.areaId);

    if (!area) {
      logHomepage("Skipped event because its area was not found.", {
        eventId: event.id,
        areaId: event.areaId
      });
      return;
    }

    const eventElement = document.createElement("article");
    eventElement.className = `journey-event journey-event--${event.type}`;
    eventElement.dataset.eventId = event.id;
    eventElement.dataset.eventType = event.type;
    eventElement.dataset.theme = area.theme;
    setEventPosition(eventElement, event);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "journey-event__button";
    button.setAttribute("aria-label", `Open details for ${event.title}`);

    const dot = document.createElement("span");
    dot.className = "journey-event__dot";
    dot.setAttribute("aria-hidden", "true");

    const card = document.createElement("span");
    card.className = "journey-event__card";

    if (event.type === "major") {
      card.append(createPlaceholderImage());
    }

    const meta = document.createElement("span");
    meta.className = "journey-event__meta";
    meta.textContent = event.date;

    const title = document.createElement("strong");
    title.className = "journey-event__title";
    title.textContent = event.title;

    const description = document.createElement("span");
    description.className = "journey-event__description";
    description.textContent = event.description;

    card.append(meta, title, description);
    button.append(dot, card);
    button.addEventListener("click", () => openEventPopover(event.id));
    eventElement.append(button);
    container.append(eventElement);
  });

  logHomepage("Rendered timeline events.", {
    eventCount: HOMEPAGE_TIMELINE_DATA.events.length,
    majorCount: HOMEPAGE_TIMELINE_DATA.events.filter((event) => event.type === "major").length,
    minorCount: HOMEPAGE_TIMELINE_DATA.events.filter((event) => event.type === "minor").length
  });
};

const updateEventPositions = () => {
  document.querySelectorAll(".journey-event").forEach((element) => {
    const event = HOMEPAGE_TIMELINE_DATA.events.find(
      (timelineEvent) => timelineEvent.id === element.dataset.eventId
    );

    if (event) {
      setEventPosition(element, event);
    }
  });
};

const updatePath = () => {
  const mobileLayout = window.matchMedia(`(max-width: ${TIMELINE_BREAKPOINT}px)`).matches;
  const path = mobileLayout
    ? HOMEPAGE_TIMELINE_DATA.path.mobile
    : HOMEPAGE_TIMELINE_DATA.path.desktop;

  document.querySelectorAll("[data-path-main], [data-path-shadow]").forEach((pathElement) => {
    pathElement.setAttribute("d", path);
  });

  logHomepage("Applied SVG timeline path.", {
    layout: mobileLayout ? "mobile" : "desktop",
    path
  });
};

const setTimelineView = (view) => {
  const root = document.querySelector(".timeline-home");
  const buttons = document.querySelectorAll("[data-view-button]");

  if (!root || !["overview", "details"].includes(view)) {
    logHomepage("Timeline view update skipped.", { view });
    return;
  }

  root.dataset.view = view;
  buttons.forEach((button) => {
    const active = button.dataset.viewButton === view;
    button.setAttribute("aria-pressed", String(active));
  });

  logHomepage("Timeline view changed.", {
    view,
    visibleEventTypes: view === "overview" ? ["major"] : ["major", "minor"]
  });
};

const closeEventPopover = () => {
  const popover = document.querySelector("#timeline-event-popover");

  if (!popover || popover.hidden) {
    return;
  }

  popover.hidden = true;
  popover.innerHTML = "";
  logHomepage("Closed event detail popover.");
};

function openEventPopover(eventId) {
  const popover = document.querySelector("#timeline-event-popover");
  const event = HOMEPAGE_TIMELINE_DATA.events.find(
    (timelineEvent) => timelineEvent.id === eventId
  );
  const area = event ? getAreaById(event.areaId) : null;

  if (!popover || !event || !area) {
    logHomepage("Event detail popover could not open.", { eventId });
    return;
  }

  popover.innerHTML = `
    <section class="timeline-event-popover__panel">
      <div class="timeline-event-popover__top">
        <div>
          <p class="timeline-event-popover__type">
            ${event.type === "major" ? "Major Event" : "Minor Event"}
          </p>
          <h2 id="timeline-popover-title">${event.title}</h2>
        </div>
        <button
          type="button"
          class="timeline-event-popover__close"
          data-popover-close
          aria-label="Close event details"
        >×</button>
      </div>
      <div class="timeline-event-popover__body">
        <div class="placeholder-image" aria-hidden="true">Placeholder</div>
        <p class="timeline-event-popover__date">${event.date}</p>
        <p>${event.description}</p>
        <p>Area: ${area.title}</p>
      </div>
    </section>
  `;

  popover.hidden = false;
  popover.querySelector("[data-popover-close]").focus();
  logHomepage("Opened event detail popover.", {
    eventId: event.id,
    type: event.type,
    areaId: area.id
  });
}

const bindTimelineControls = () => {
  document.querySelectorAll("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => setTimelineView(button.dataset.viewButton));
  });

  const popover = document.querySelector("#timeline-event-popover");
  if (popover) {
    popover.addEventListener("click", (event) => {
      if (
        event.target === popover ||
        event.target.closest("[data-popover-close]")
      ) {
        closeEventPopover();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEventPopover();
    }
  });

  window.addEventListener("resize", () => {
    updatePath();
    updateEventPositions();
  });

  logHomepage("Bound timeline controls.");
};

const initializeHomepageTimeline = () => {
  const areaContainer = document.querySelector("#journey-areas");
  const eventContainer = document.querySelector("#journey-events");

  if (!areaContainer || !eventContainer) {
    logHomepage("Homepage timeline skipped because required containers are missing.", {
      hasAreaContainer: Boolean(areaContainer),
      hasEventContainer: Boolean(eventContainer)
    });
    return;
  }

  renderAreas(areaContainer);
  renderEvents(eventContainer);
  updatePath();
  setTimelineView("overview");
  bindTimelineControls();

  logHomepage("Initialized Curved Path Timeline Homepage prototype.", {
    defaultView: "overview",
    areaCount: HOMEPAGE_TIMELINE_DATA.areas.length,
    eventCount: HOMEPAGE_TIMELINE_DATA.events.length,
    usesPlaceholderContentOnly: true
  });
};

document.addEventListener("DOMContentLoaded", () => {
  logHomepage("Static script loaded.", {
    page: document.body.dataset.page || "unknown"
  });
  initializeHomepageTimeline();
});
