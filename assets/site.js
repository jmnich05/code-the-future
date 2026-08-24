const root = document.documentElement;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = reducedMotionQuery.matches;

// Preserve old campaign and bookmark URLs from the former one-page site.
// Fragments cannot be redirected by Netlify, so route them in the browser.
if (window.location.pathname === "/" && window.location.hash) {
  const legacyRoutes = {
    "#audiences": "/programs.html",
    "#learns": "/curriculum.html",
    "#why": "/why-ai-now.html",
    "#platform": "/how-it-works.html",
    "#cohorts": "/enroll.html#schedule",
    "#deposit": "/enroll.html#deposit",
    "#checkout": "/enroll.html#checkout",
    "#signup": "/enroll.html#interest",
  };
  const legacyDestination = legacyRoutes[window.location.hash.toLowerCase()];
  if (legacyDestination) window.location.replace(legacyDestination);
}

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});

const navToggle = document.querySelector("[data-nav-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const mobileNavLinks = mobileNav ? [...mobileNav.querySelectorAll("a")] : [];
mobileNav?.setAttribute("aria-hidden", "true");

function renderIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

renderIcons();

function closeMenu({ restoreFocus = false } = {}) {
  if (!navToggle || !mobileNav) return;
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute("aria-label", "Open navigation");
  mobileNav.setAttribute("aria-hidden", "true");
  mobileNav.classList.remove("is-open");
  document.body.classList.remove("menu-open");
  const icon = navToggle.querySelector("[data-nav-icon]");
  if (icon) icon.setAttribute("data-lucide", "menu");
  renderIcons();
  if (restoreFocus) navToggle.focus();
}

navToggle?.addEventListener("click", () => {
  const willOpen = navToggle.getAttribute("aria-expanded") !== "true";
  navToggle.setAttribute("aria-expanded", String(willOpen));
  navToggle.setAttribute("aria-label", willOpen ? "Close navigation" : "Open navigation");
  mobileNav?.setAttribute("aria-hidden", String(!willOpen));
  mobileNav?.classList.toggle("is-open", willOpen);
  document.body.classList.toggle("menu-open", willOpen);
  const icon = navToggle.querySelector("[data-nav-icon]");
  if (icon) icon.setAttribute("data-lucide", willOpen ? "x" : "menu");
  renderIcons();
  if (willOpen) requestAnimationFrame(() => mobileNavLinks[0]?.focus());
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileNav?.classList.contains("is-open")) closeMenu({ restoreFocus: true });
  if (event.key !== "Tab" || !mobileNav?.classList.contains("is-open") || !mobileNavLinks.length) return;
  const first = mobileNavLinks[0];
  const last = mobileNavLinks[mobileNavLinks.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.querySelectorAll("[data-track]").forEach((link) => {
  link.addEventListener("click", () => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "cta_click", {
        cta_name: link.dataset.track,
        page_path: window.location.pathname,
      });
    }
  });
});

const growthStage = document.querySelector("[data-growth-stage]");
const growthArt = document.querySelector("[data-growth-art]");
const growthClose = document.querySelector("[data-growth-close]");
const growthCanvas = document.querySelector("[data-growth-canvas]");
let depthRenderer = null;
let depthRendererInit = null;
let heroPanX = 0;
let heroPanY = 0;
let heroDrift = 0;
let heroMaxX = 0;
let heroMaxY = 0;
let heroExpanded = false;
let heroDragging = false;
let heroPointerId = null;
let heroPointerX = 0;
let heroPointerY = 0;
let frame = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sizeHeroArt() {
  if (!growthStage || !growthArt) return;
  const box = growthStage.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const naturalWidth = growthArt.naturalWidth || 1536;
  const naturalHeight = growthArt.naturalHeight || 1024;
  const coverScale = Math.max(box.width / naturalWidth, box.height / naturalHeight);
  const zoom = heroExpanded ? 1.48 : 1.34;
  const renderWidth = naturalWidth * coverScale * zoom;
  const renderHeight = naturalHeight * coverScale * zoom;
  const edgeBuffer = Math.max(24, Math.min(box.width, box.height) * 0.045);

  // Keep a deliberate overscan buffer so fast wheel and pointer input can
  // never land on the literal edge of the artwork.
  heroMaxX = Math.max(0, (renderWidth - box.width) / 2 - edgeBuffer);
  heroMaxY = Math.max(0, (renderHeight - box.height) / 2 - edgeBuffer);
  growthStage.style.setProperty("--hero-render-width", `${renderWidth}px`);
  growthStage.style.setProperty("--hero-render-height", `${renderHeight}px`);
  depthRenderer?.resize();
  queueHeroPosition();
}

function paintHeroPosition() {
  if (!growthStage) return;
  growthStage.style.setProperty("--hero-x", `${-heroPanX * heroMaxX}px`);
  growthStage.style.setProperty("--hero-y", `${-heroPanY * heroMaxY}px`);
  depthRenderer?.setView({ panX: heroPanX, panY: heroPanY, drift: heroDrift, expanded: heroExpanded });
  frame = 0;
}

function queueHeroPosition() {
  if (!frame) frame = requestAnimationFrame(paintHeroPosition);
}

function setHeroExpanded(expanded) {
  if (!growthStage || heroExpanded === expanded) return;
  heroExpanded = expanded;
  growthStage.classList.toggle("is-expanded", expanded);
  growthStage.setAttribute("aria-expanded", String(expanded));
  document.body.classList.toggle("hero-exploring", expanded);
  if (expanded) {
    heroDrift = 0;
    growthStage.style.setProperty("--hero-drift-y", "0px");
  }
  if (!expanded) {
    heroPanX = 0;
    heroPanY = 0;
  }
  requestAnimationFrame(() => requestAnimationFrame(sizeHeroArt));
  if (expanded) growthStage.focus({ preventScroll: true });
  if (typeof window.gtag === "function") {
    window.gtag("event", expanded ? "hero_explorer_open" : "hero_explorer_close", {
      page_path: window.location.pathname,
    });
  }
}

async function initDepthRenderer() {
  if (
    reducedMotion ||
    depthRenderer ||
    depthRendererInit ||
    !growthStage ||
    !growthArt ||
    !growthCanvas ||
    !growthStage.dataset.depthSrc
  ) return;

  depthRendererInit = import("/assets/depth-pan-renderer.js?v=20260822-living")
    .then(({ mountDepthPanRenderer }) => mountDepthPanRenderer({
      stage: growthStage,
      image: growthArt,
      canvas: growthCanvas,
      depthUrl: growthStage.dataset.depthSrc,
      strength: Number(growthStage.dataset.depthStrength),
      focus: Number(growthStage.dataset.depthFocus),
    }))
    .then((renderer) => {
      if (reducedMotion) {
        renderer.destroy();
        return;
      }
      depthRenderer = renderer;
      depthRenderer.setView({ panX: heroPanX, panY: heroPanY, drift: heroDrift, expanded: heroExpanded });
      depthRenderer.resize();
    })
    .catch(() => {
      growthStage.dataset.depthState = "fallback";
      growthStage.classList.remove("is-depth-ready");
      growthCanvas.hidden = true;
    })
    .finally(() => {
      depthRendererInit = null;
    });
}

function moveHeroFromPointer(event) {
  if (!growthStage) return;
  const box = growthStage.getBoundingClientRect();
  heroPanX = clamp(((event.clientX - box.left) / box.width - 0.5) * 2, -1, 1);
  heroPanY = clamp(((event.clientY - box.top) / box.height - 0.5) * 2, -1, 1);
  queueHeroPosition();
}

if (growthStage && growthArt) {
  growthStage.addEventListener("depthrendererfallback", () => {
    depthRenderer = null;
  });

  if (growthArt.complete) {
    sizeHeroArt();
    initDepthRenderer();
  } else {
    growthArt.addEventListener("load", () => {
      sizeHeroArt();
      initDepthRenderer();
    }, { once: true });
  }
  window.addEventListener("resize", sizeHeroArt);
  if ("ResizeObserver" in window) {
    const growthObserver = new ResizeObserver(sizeHeroArt);
    growthObserver.observe(growthStage);
  }
  growthStage.addEventListener("animationend", sizeHeroArt);

  growthStage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      if (!heroDragging || event.pointerId !== heroPointerId) return;
      const sensitivityX = heroMaxX ? 1 / heroMaxX : 0;
      const sensitivityY = heroMaxY ? 1 / heroMaxY : 0;
      heroPanX = clamp(heroPanX - (event.clientX - heroPointerX) * sensitivityX, -1, 1);
      heroPanY = clamp(heroPanY - (event.clientY - heroPointerY) * sensitivityY, -1, 1);
      heroPointerX = event.clientX;
      heroPointerY = event.clientY;
      queueHeroPosition();
      return;
    }
    if (!heroDragging) moveHeroFromPointer(event);
  });

  growthStage.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    if (!heroExpanded) setHeroExpanded(true);
    heroDragging = true;
    heroPointerId = event.pointerId;
    heroPointerX = event.clientX;
    heroPointerY = event.clientY;
    growthStage.classList.add("is-dragging");
    growthStage.setPointerCapture(event.pointerId);
  });

  const finishHeroDrag = (event) => {
    if (event.pointerId !== heroPointerId) return;
    heroDragging = false;
    heroPointerId = null;
    growthStage.classList.remove("is-dragging");
  };

  growthStage.addEventListener("pointerup", finishHeroDrag);
  growthStage.addEventListener("pointercancel", finishHeroDrag);
  growthStage.addEventListener("lostpointercapture", finishHeroDrag);

  growthStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (!heroExpanded) setHeroExpanded(true);

    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    const verticalDelta = event.shiftKey ? 0 : event.deltaY;
    heroPanX = clamp(heroPanX + horizontalDelta / Math.max(180, heroMaxX * 1.5), -1, 1);
    heroPanY = clamp(heroPanY + verticalDelta / Math.max(180, heroMaxY * 1.5), -1, 1);
    queueHeroPosition();
  }, { passive: false });

  growthStage.addEventListener("click", () => {
    if (!heroExpanded) setHeroExpanded(true);
  });
  growthClose?.addEventListener("click", (event) => {
    event.stopPropagation();
    setHeroExpanded(false);
  });

  document.addEventListener("pointerdown", (event) => {
    if (heroExpanded && !growthStage.contains(event.target)) setHeroExpanded(false);
  });

  growthStage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setHeroExpanded(!heroExpanded);
      return;
    }
    if (event.key === "Escape" && heroExpanded) {
      event.preventDefault();
      setHeroExpanded(false);
      return;
    }
    const box = growthStage.getBoundingClientRect();
    const directions = {
      ArrowLeft: [-Math.max(40, box.width * .08), 0],
      ArrowRight: [Math.max(40, box.width * .08), 0],
      ArrowUp: [0, -Math.max(40, box.height * .08)],
      ArrowDown: [0, Math.max(40, box.height * .08)],
    };
    if (!directions[event.key]) return;
    event.preventDefault();
    if (!heroExpanded) setHeroExpanded(true);
    heroPanX = clamp(heroPanX + directions[event.key][0] / Math.max(1, heroMaxX), -1, 1);
    heroPanY = clamp(heroPanY + directions[event.key][1] / Math.max(1, heroMaxY), -1, 1);
    queueHeroPosition();
  });
}

if (!reducedMotion) {
  import("https://cdn.jsdelivr.net/npm/motion@13.1.1/+esm")
    .then(({ animate, inView, scroll }) => {
      root.classList.add("motion-ready");

      inView("[data-reveal]", (element) => {
        element.classList.add("is-visible");
        animate(element, { opacity: [0, 1], y: [24, 0] }, { duration: 0.62, easing: [0.22, 1, 0.36, 1] });
      }, { margin: "0px 0px -10% 0px", amount: 0.18 });

      if (growthStage) {
        scroll((progress) => {
          if (reducedMotion || heroExpanded) return;
          heroDrift = (progress - 0.5) * 28;
          growthStage.style.setProperty("--hero-drift-y", `${heroDrift}px`);
          depthRenderer?.setView({ panX: heroPanX, panY: heroPanY, drift: heroDrift, expanded: false });
        }, { target: growthStage, offset: ["start end", "end start"] });
      }

    })
    .catch(() => {
      root.classList.remove("motion-ready");
      document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
    });
} else {
  document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
}

reducedMotionQuery.addEventListener?.("change", (event) => {
  reducedMotion = event.matches;
  if (reducedMotion) {
    heroDrift = 0;
    growthStage?.style.setProperty("--hero-drift-y", "0px");
    depthRenderer?.setActive(false);
  } else if (depthRenderer) {
    depthRenderer.setActive(true);
    depthRenderer.setView({ panX: heroPanX, panY: heroPanY, drift: heroDrift, expanded: heroExpanded });
    depthRenderer.resize();
  } else {
    initDepthRenderer();
  }
});
