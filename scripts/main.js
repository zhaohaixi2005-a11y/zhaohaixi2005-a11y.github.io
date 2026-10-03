(function () {
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cleanups = [];
  var pageActive = true;

  function canAnimate() {
    return pageActive && document.visibilityState !== "hidden";
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function get2dContext(canvas) {
    if (!canvas) return null;
    return canvas.getContext("2d", { alpha: true, desynchronized: true }) || canvas.getContext("2d");
  }

  function initThemeToggle() {
    var root = document.documentElement;
    if (!root) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-theme-toggle]"));
    var storageKey = "haixi-theme";
    var initialTheme = root.dataset.theme === "dark" ? "dark" : "light";
    try {
      initialTheme = window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
    } catch (err) {
      // The head bootstrap remains authoritative if storage is unavailable.
    }

    function setTheme(theme, persist) {
      var dark = theme === "dark";
      root.dataset.theme = dark ? "dark" : "light";
      var action = dark ? "Switch to light theme" : "Switch to dark theme";
      buttons.forEach(function (button) {
        button.setAttribute("aria-label", action);
        button.setAttribute("title", action);
        button.setAttribute("aria-pressed", dark ? "true" : "false");
      });
      if (persist) {
        try {
          window.localStorage.setItem(storageKey, root.dataset.theme);
        } catch (err) {
          // Theme switching still works when browser storage is blocked.
        }
      }
    }

    function onClick() {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    }

    function onStorage(event) {
      if (event.key !== storageKey && event.key !== null) return;
      if (event.newValue !== null && event.newValue !== "light" && event.newValue !== "dark") return;
      if (event.storageArea) {
        try {
          if (event.storageArea !== window.localStorage) return;
        } catch (err) {
          return;
        }
      }
      setTheme(event.newValue === "dark" ? "dark" : "light", false);
    }

    setTheme(initialTheme, false);
    buttons.forEach(function (button) { button.addEventListener("click", onClick); });
    window.addEventListener("storage", onStorage);
    cleanups.push(function () {
      buttons.forEach(function (button) { button.removeEventListener("click", onClick); });
      window.removeEventListener("storage", onStorage);
    });
  }

  function initProteinViewer() {
    var mount = document.getElementById("protein-stage");
    if (!mount) return;

    var fallback = document.getElementById("protein-fallback");
    var source = mount.getAttribute("data-pdb-source") || "rcsb://1crn";
    var modeButtons = Array.prototype.slice.call(document.querySelectorAll(".protein-mode-button"));
    var stage = null;
    var component = null;
    var disposed = false;
    var ready = false;
    var pageSuspended = false;
    var inView = false;
    var spinning = false;
    var viewportObserver = null;
    var proteinRepresentations = { cartoon: [], surface: [] };
    var activeMode = "cartoon";

    function onFail(text, err) {
      if (disposed) return;
      if (fallback) fallback.textContent = text;
      if (err) console.error(err);
    }

    function releaseStage() {
      ready = false;
      if (!stage) return;
      stage.setSpin(false);
      stage.removeAllComponents();
      stage.dispose();
      stage = null;
      component = null;
      spinning = false;
    }

    function syncModeButtons(mode) {
      modeButtons.forEach(function (button) {
        var isActive = button.getAttribute("data-protein-mode") === mode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function syncSpin() {
      if (!stage || disposed) return;
      var shouldSpin = ready && inView && !reducedMotion && !pageSuspended && canAnimate();
      if (shouldSpin === spinning) return;
      stage.setSpin(shouldSpin);
      spinning = shouldSpin;
    }

    function createSurfaceRepresentations() {
      if (!component || proteinRepresentations.surface.length) return;
      try {
        [[":A", 0x56c2ff], [":B", 0x7cf7d4]].forEach(function (chain) {
          proteinRepresentations.surface.push(
            component.addRepresentation("surface", {
              sele: chain[0] + " and protein",
              colorScheme: "uniform",
              colorValue: chain[1],
              opacity: 0.86,
              flatShaded: true,
              useWorker: true,
              visible: false
            })
          );
        });
      } catch (err) {
        proteinRepresentations.surface.forEach(function (representation) {
          representation.dispose();
        });
        proteinRepresentations.surface = [];
        throw err;
      }
    }

    function setMode(mode) {
      activeMode = mode === "surface" ? "surface" : "cartoon";
      if (component && activeMode === "surface") {
        try {
          createSurfaceRepresentations();
        } catch (err) {
          activeMode = "cartoon";
          onFail("Surface view unavailable", err);
        }
      }
      ["cartoon", "surface"].forEach(function (representationMode) {
        proteinRepresentations[representationMode].forEach(function (representation) {
          representation.setVisibility(representationMode === activeMode);
        });
      });
      syncModeButtons(activeMode);
      if (stage && stage.viewer) stage.viewer.requestRender();
    }

    function checkViewport() {
      var bounds = mount.getBoundingClientRect();
      inView = bounds.bottom > 0 && bounds.top < window.innerHeight &&
        bounds.right > 0 && bounds.left < window.innerWidth;
      syncSpin();
    }

    function onResize() {
      if (!stage || disposed) return;
      stage.handleResize();
      if (!viewportObserver) checkViewport();
    }

    function onVisibilityChange() { syncSpin(); }
    function onPageHide() {
      pageSuspended = true;
      syncSpin();
    }
    function onPageShow() {
      pageActive = true;
      pageSuspended = false;
      checkViewport();
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    if ("IntersectionObserver" in window) {
      viewportObserver = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        syncSpin();
      }, { threshold: 0.01 });
      viewportObserver.observe(mount);
    } else {
      checkViewport();
      window.addEventListener("scroll", checkViewport, { passive: true });
    }

    function bootNgl() {
      if (disposed) return;
      if (!window.NGL || !window.NGL.Stage) {
        onFail("Interactive view unavailable · showing structure preview");
        return;
      }
      try {
        stage = new window.NGL.Stage("protein-stage", {
          backgroundColor: "transparent",
          quality: "medium",
          sampleLevel: 1
        });
        // NGL can return a partial stage when the browser has no WebGL renderer.
        if (!stage.viewer || !stage.viewer.renderer) {
          if (stage.tasks) stage.tasks.dispose();
          stage = null;
          throw new Error("WebGL unavailable");
        }
        Promise.resolve(stage.loadFile(source, { defaultRepresentation: false }))
          .then(function (loadedComponent) {
            if (disposed) {
              loadedComponent.dispose();
              return;
            }
            component = loadedComponent;
            [[":A", 0x56c2ff], [":B", 0x7cf7d4]].forEach(function (chain) {
              proteinRepresentations.cartoon.push(
                component.addRepresentation("cartoon", {
                  sele: chain[0] + " and protein",
                  colorScheme: "uniform",
                  colorValue: chain[1],
                  opacity: 0.98,
                  flatShaded: true,
                  visible: false
                })
              );
            });
            component.addRepresentation("ball+stick", {
              sele: "hetero and not water",
              colorScheme: "uniform",
              colorValue: 0xf6c177,
              opacity: 0.96,
              scale: 2.2
            });
            setMode(activeMode);
            component.autoView();
            ready = true;
            syncSpin();
            mount.classList.add("ready");
          })
          .catch(function (err) {
            releaseStage();
            onFail("Interactive view unavailable · showing structure preview", err);
          });
      } catch (err) {
        releaseStage();
        onFail("Interactive view unavailable · showing structure preview", err);
      }
    }

    modeButtons.forEach(function (button) {
      var onClick = function () {
        if (!disposed) setMode(button.getAttribute("data-protein-mode"));
      };
      button.addEventListener("click", onClick);
      cleanups.push(function () { button.removeEventListener("click", onClick); });
    });
    cleanups.push(function () {
      disposed = true;
      if (viewportObserver) viewportObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", checkViewport);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      releaseStage();
    });

    syncModeButtons(activeMode);
    if (window.NGL && window.NGL.Stage) {
      bootNgl();
    } else {
      loadScript("https://cdn.jsdelivr.net/npm/ngl@2.0.0-dev.37/dist/ngl.js")
        .catch(function (err) {
          if (disposed) throw err;
          return loadScript("https://unpkg.com/ngl@2.0.0-dev.37/dist/ngl.js");
        })
        .then(bootNgl)
        .catch(function (err) { onFail("Interactive view unavailable · showing structure preview", err); });
    }
  }

  function initPortraitToggle() {
    var portrait = document.querySelector("button.profile-flip-card");
    if (!portrait) return;
    var onClick = function () {
      var flipped = portrait.getAttribute("aria-pressed") !== "true";
      portrait.classList.toggle("is-flipped", flipped);
      portrait.setAttribute("aria-pressed", flipped ? "true" : "false");
    };
    portrait.addEventListener("click", onClick);
    cleanups.push(function () { portrait.removeEventListener("click", onClick); });
  }

  var backgroundState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    particles: [],
    rafId: 0,
    lastTs: null,
    lastMotionTs: null
  };

  function resizeParticleCanvas() {
    var s = backgroundState;
    if (!s.canvas || !s.ctx) return;

    s.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    s.width = Math.max(s.canvas.clientWidth || 0, window.innerWidth || 0, 1);
    s.height = Math.max(s.canvas.clientHeight || 0, window.innerHeight || 0, 1);
    s.canvas.width = Math.max(1, Math.floor(s.width * s.dpr));
    s.canvas.height = Math.max(1, Math.floor(s.height * s.dpr));
    s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);

    var particleCount = Math.max(28, Math.min(80, Math.floor((s.width * s.height) / 22000)));
    s.particles = [];
    s.lastTs = null;
    s.lastMotionTs = null;
    for (var i = 0; i < particleCount; i += 1) {
      s.particles.push({
        x: Math.random() * s.width,
        y: Math.random() * s.height,
        vx: (Math.random() - 0.5) * 0.62 * 60,
        vy: (Math.random() - 0.5) * 0.62 * 60,
        r: 1 + Math.random() * 2.1
      });
    }
  }

  function drawParticleFrame(deltaSeconds) {
    var s = backgroundState;
    var ctx = s.ctx;
    if (!ctx) return;
    var maxLinkDistance = 140;
    var maxLinkDistanceSq = maxLinkDistance * maxLinkDistance;

    ctx.clearRect(0, 0, s.width, s.height);

    for (var i = 0; i < s.particles.length; i += 1) {
      var p = s.particles[i];
      p.x += p.vx * (deltaSeconds || 0);
      p.y += p.vy * (deltaSeconds || 0);

      if (p.x < -12 || p.x > s.width + 12) p.vx *= -1;
      if (p.y < -12 || p.y > s.height + 12) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(212, 244, 255, 0.98)";
      ctx.fill();

      for (var j = i + 1; j < s.particles.length; j += 1) {
        var q = s.particles[j];
        var dx = p.x - q.x;
        var dy = p.y - q.y;
        var distSq = dx * dx + dy * dy;
        if (distSq < maxLinkDistanceSq) {
          var dist = Math.sqrt(distSq);
          var alpha = (1 - dist / maxLinkDistance) * 0.55;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(165, 229, 255," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }
  }

  function startBackgroundAnimation() {
    if (reducedMotion || !canAnimate() || backgroundState.rafId || !backgroundState.ctx) return;
    backgroundState.rafId = window.requestAnimationFrame(animateBackground);
  }

  function stopBackgroundAnimation() {
    if (backgroundState.rafId) window.cancelAnimationFrame(backgroundState.rafId);
    backgroundState.rafId = 0;
    backgroundState.lastTs = null;
    backgroundState.lastMotionTs = null;
  }

  function animateBackground(timestamp) {
    var s = backgroundState;
    s.rafId = 0;
    if (!canAnimate()) return;
    var interval = 1000 / 30;
    var elapsed = s.lastTs === null ? interval : timestamp - s.lastTs;
    if (elapsed >= interval) {
      var delta = s.lastMotionTs === null ? 0 : Math.min((timestamp - s.lastMotionTs) / 1000, 0.1);
      drawParticleFrame(delta);
      s.lastTs = timestamp - elapsed % interval;
      s.lastMotionTs = timestamp;
    }
    startBackgroundAnimation();
  }

  function initSiteParticles() {
    var canvas = document.getElementById("site-bg-canvas");
    if (!canvas) return;

    backgroundState.canvas = canvas;
    backgroundState.ctx = get2dContext(canvas);
    if (!backgroundState.ctx) return;

    resizeParticleCanvas();
    drawParticleFrame();
    startBackgroundAnimation();

    var onResize = function () {
      if (!canAnimate()) return;
      resizeParticleCanvas();
      drawParticleFrame();
      startBackgroundAnimation();
    };
    window.addEventListener("resize", onResize);
    cleanups.push(function () {
      window.removeEventListener("resize", onResize);
      stopBackgroundAnimation();
    });
  }

  function initSectionNavigation() {
    if (!("IntersectionObserver" in window)) return;
    var sectionIds = ["research", "publications", "about", "competitions", "contact"];
    var navigation = Array.prototype.slice.call(document.querySelectorAll('.navlinks a[href^="#"]'))
      .map(function (link) {
        var id = link.getAttribute("href").slice(1);
        return { link: link, section: sectionIds.indexOf(id) === -1 ? null : document.getElementById(id) };
      })
      .filter(function (item) { return item.section; });
    if (!navigation.length) return;

    var header = document.querySelector(".topbar");
    var footer = document.querySelector(".footer");
    var sectionObserver = null;
    var footerObserver = null;
    var readingTop = 0;
    var footerVisible = false;

    function syncCurrentSection() {
      var current = null;
      var closestTop = -Infinity;
      navigation.forEach(function (item) {
        var top = item.section.getBoundingClientRect().top;
        if ((footerVisible || top <= readingTop + 1) && top > closestTop) {
          current = item;
          closestTop = top;
        }
      });
      navigation.forEach(function (item) {
        var selected = item === current;
        item.link.classList.toggle("is-current", selected);
        if (selected) item.link.setAttribute("aria-current", "location");
        else item.link.removeAttribute("aria-current");
      });
    }

    function observeReadingBand() {
      if (sectionObserver) sectionObserver.disconnect();
      var height = Math.max(window.innerHeight || 0, 1);
      var headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      var anchorOffset = 0;
      if (window.getComputedStyle) {
        navigation.forEach(function (item) {
          anchorOffset = Math.max(anchorOffset, parseFloat(window.getComputedStyle(item.section).scrollMarginTop) || 0);
        });
      }
      readingTop = Math.min(Math.max(Math.ceil(headerBottom) + 16, anchorOffset + 2), Math.max(height - 2, 0));
      // A thin band keeps long sections current without work on every scroll event.
      var bottomInset = Math.max(height - readingTop - 2, 0);
      sectionObserver = new IntersectionObserver(syncCurrentSection, {
        rootMargin: "-" + readingTop + "px 0px -" + bottomInset + "px 0px",
        threshold: 0
      });
      navigation.forEach(function (item) { sectionObserver.observe(item.section); });
      syncCurrentSection();
    }

    observeReadingBand();
    if (footer) {
      // The last short section may never reach the band at the end of the page.
      footerObserver = new IntersectionObserver(function (entries) {
        footerVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.99;
        syncCurrentSection();
      }, { threshold: 1 });
      footerObserver.observe(footer);
    }
    window.addEventListener("resize", observeReadingBand);
    window.addEventListener("pageshow", syncCurrentSection);
    cleanups.push(function () {
      if (sectionObserver) sectionObserver.disconnect();
      if (footerObserver) footerObserver.disconnect();
      window.removeEventListener("resize", observeReadingBand);
      window.removeEventListener("pageshow", syncCurrentSection);
    });
  }

  function initRevealObserver() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px -24px 0px" }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
    cleanups.push(function () { io.disconnect(); });
  }

  initThemeToggle();
  initSiteParticles();
  initProteinViewer();
  initPortraitToggle();
  initSectionNavigation();
  initRevealObserver();

  var refreshRafA = 0;
  var refreshRafB = 0;

  function cancelRefreshFrames() {
    if (refreshRafA) {
      window.cancelAnimationFrame(refreshRafA);
      refreshRafA = 0;
    }
    if (refreshRafB) {
      window.cancelAnimationFrame(refreshRafB);
      refreshRafB = 0;
    }
  }

  function refreshInteractiveCanvases() {
    cancelRefreshFrames();
    if (backgroundState.ctx) {
      resizeParticleCanvas();
      drawParticleFrame();
      startBackgroundAnimation();
    }
  }

  function scheduleInteractiveRefresh() {
    cancelRefreshFrames();
    if (!canAnimate() || !backgroundState.ctx) return;
    refreshRafA = window.requestAnimationFrame(function () {
      refreshRafA = 0;
      refreshRafB = window.requestAnimationFrame(function () {
        refreshRafB = 0;
        refreshInteractiveCanvases();
      });
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      stopBackgroundAnimation();
      cancelRefreshFrames();
      return;
    }
    scheduleInteractiveRefresh();
  });

  window.addEventListener("pagehide", function (event) {
    pageActive = false;
    stopBackgroundAnimation();
    cancelRefreshFrames();
    // A cached page must keep its viewer and listeners for pageshow.
    if (!event.persisted) {
      cleanups.forEach(function (cleanup) { cleanup(); });
      cleanups = [];
    }
  });

  window.addEventListener("pageshow", function () {
    pageActive = true;
    scheduleInteractiveRefresh();
  });
})();
