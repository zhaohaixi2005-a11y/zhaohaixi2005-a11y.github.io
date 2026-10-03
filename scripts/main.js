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
        onFail("3D engine unavailable");
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
            onFail("3D model failed to load", err);
          });
      } catch (err) {
        releaseStage();
        onFail("3D engine unavailable", err);
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
        .catch(function (err) { onFail("3D engine unavailable", err); });
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

  var projectWaveState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    rafId: 0,
    lastTs: null,
    resizeRaf: 0,
    layers: [
      {
        base: 0.36,
        ampA: 26,
        ampB: 12,
        ampC: 7,
        freqA: 0.0074,
        freqB: 0.013,
        freqC: 0.020,
        speedA: 0.00016,
        speedB: -0.0001,
        speedC: 0.00022,
        phase: 0.2,
        depth: 168,
        strokeAlpha: 0.22,
        topAlpha: 0.18,
        bottomAlpha: 0.02,
        lineWidth: 1.6
      },
      {
        base: 0.52,
        ampA: 32,
        ampB: 16,
        ampC: 10,
        freqA: 0.0061,
        freqB: 0.0106,
        freqC: 0.017,
        speedA: 0.00011,
        speedB: -0.00014,
        speedC: 0.00019,
        phase: 1.7,
        depth: 210,
        strokeAlpha: 0.18,
        topAlpha: 0.14,
        bottomAlpha: 0.015,
        lineWidth: 1.8
      },
      {
        base: 0.68,
        ampA: 28,
        ampB: 15,
        ampC: 8,
        freqA: 0.0052,
        freqB: 0.0094,
        freqC: 0.016,
        speedA: 0.00008,
        speedB: -0.0001,
        speedC: 0.00015,
        phase: 3.2,
        depth: 240,
        strokeAlpha: 0.14,
        topAlpha: 0.11,
        bottomAlpha: 0.012,
        lineWidth: 1.4
      }
    ]
  };

  function resizeProjectWaveCanvas() {
    var s = projectWaveState;
    if (!s.canvas || !s.ctx) return;

    s.dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    s.width = Math.max(window.innerWidth || 0, 1);
    s.height = Math.max(window.innerHeight || 0, 1);
    s.canvas.width = Math.floor(s.width * s.dpr);
    s.canvas.height = Math.floor(s.height * s.dpr);
    s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  }

  function sampleProjectWaveY(layer, x, timestamp, height) {
    var drift = Math.sin(timestamp * 0.00009 + layer.phase * 1.3) * height * 0.012;
    return (
      height * layer.base +
      drift +
      Math.sin(x * layer.freqA + timestamp * layer.speedA + layer.phase) * layer.ampA +
      Math.sin(x * layer.freqB + timestamp * layer.speedB + layer.phase * 1.9) * layer.ampB +
      Math.sin(x * layer.freqC + timestamp * layer.speedC + layer.phase * 2.7) * layer.ampC
    );
  }

  function drawProjectWaveFrame(timestamp) {
    var s = projectWaveState;
    var ctx = s.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, s.width, s.height);

    for (var i = 0; i < s.layers.length; i += 1) {
      var layer = s.layers[i];
      var points = [];
      var gradient = ctx.createLinearGradient(0, s.height * layer.base - 40, 0, s.height * layer.base + layer.depth);
      gradient.addColorStop(0, "rgba(146, 224, 255," + layer.topAlpha.toFixed(3) + ")");
      gradient.addColorStop(0.45, "rgba(98, 194, 255," + (layer.topAlpha * 0.72).toFixed(3) + ")");
      gradient.addColorStop(1, "rgba(36, 88, 148," + layer.bottomAlpha.toFixed(3) + ")");

      ctx.beginPath();
      for (var x = -40; x <= s.width + 40; x += 10) {
        var y = sampleProjectWaveY(layer, x, timestamp, s.height);
        points.push({ x: x, y: y });
        if (x === -40) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.lineTo(s.width + 40, s.height + layer.depth);
      ctx.lineTo(-40, s.height + layer.depth);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      for (var j = 0; j < points.length; j += 1) {
        if (j === 0) {
          ctx.moveTo(points[j].x, points[j].y);
        } else {
          ctx.lineTo(points[j].x, points[j].y);
        }
      }
      ctx.strokeStyle = "rgba(168, 232, 255," + layer.strokeAlpha.toFixed(3) + ")";
      ctx.lineWidth = layer.lineWidth;
      ctx.stroke();
    }

    var gradient = ctx.createLinearGradient(0, s.height * 0.2, 0, s.height);
    gradient.addColorStop(0, "rgba(110, 198, 255, 0.00)");
    gradient.addColorStop(0.5, "rgba(110, 198, 255, 0.04)");
    gradient.addColorStop(1, "rgba(86, 247, 212, 0.08)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s.width, s.height);
  }

  function animateProjectWave(timestamp) {
    var s = projectWaveState;
    s.rafId = 0;
    if (!canAnimate()) return;
    var interval = 1000 / 24;
    var elapsed = s.lastTs === null ? interval : timestamp - s.lastTs;
    if (elapsed >= interval) {
      drawProjectWaveFrame(timestamp);
      s.lastTs = timestamp - elapsed % interval;
    }
    startProjectWaveAnimation();
  }

  function startProjectWaveAnimation() {
    if (reducedMotion || !canAnimate() || projectWaveState.rafId || !projectWaveState.ctx) return;
    projectWaveState.rafId = window.requestAnimationFrame(animateProjectWave);
  }

  function stopProjectWaveAnimation() {
    if (projectWaveState.rafId) window.cancelAnimationFrame(projectWaveState.rafId);
    projectWaveState.rafId = 0;
    projectWaveState.lastTs = null;
    if (projectWaveState.resizeRaf) window.cancelAnimationFrame(projectWaveState.resizeRaf);
    projectWaveState.resizeRaf = 0;
  }

  function initProjectWaveCanvas() {
    var shell = document.querySelector(".project-shell");
    if (!shell) return;

    var canvas = document.createElement("canvas");
    canvas.className = "project-wave-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);

    projectWaveState.canvas = canvas;
    projectWaveState.ctx = get2dContext(canvas);
    if (!projectWaveState.ctx) return;

    resizeProjectWaveCanvas();
    drawProjectWaveFrame(0);
    startProjectWaveAnimation();

    var onResize = function () {
      if (!canAnimate() || projectWaveState.resizeRaf) return;
      projectWaveState.resizeRaf = window.requestAnimationFrame(function () {
        projectWaveState.resizeRaf = 0;
        if (!canAnimate()) return;
        resizeProjectWaveCanvas();
        drawProjectWaveFrame(performance.now ? performance.now() : 0);
        startProjectWaveAnimation();
      });
    };
    window.addEventListener("resize", onResize);
    cleanups.push(function () {
      window.removeEventListener("resize", onResize);
      stopProjectWaveAnimation();
      if (projectWaveState.resizeRaf) {
        window.cancelAnimationFrame(projectWaveState.resizeRaf);
        projectWaveState.resizeRaf = 0;
      }
      if (projectWaveState.canvas && projectWaveState.canvas.parentNode) {
        projectWaveState.canvas.parentNode.removeChild(projectWaveState.canvas);
      }
    });
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

  function initRevealObserver() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.15 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
    cleanups.push(function () { io.disconnect(); });
  }

  initSiteParticles();
  initProjectWaveCanvas();
  initProteinViewer();
  initPortraitToggle();
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

    if (projectWaveState.ctx) {
      resizeProjectWaveCanvas();
      drawProjectWaveFrame(performance.now ? performance.now() : 0);
      startProjectWaveAnimation();
    }
  }

  function scheduleInteractiveRefresh() {
    cancelRefreshFrames();
    if (!canAnimate()) return;
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
      stopProjectWaveAnimation();
      cancelRefreshFrames();
      return;
    }
    scheduleInteractiveRefresh();
  });

  window.addEventListener("pagehide", function (event) {
    pageActive = false;
    stopBackgroundAnimation();
    stopProjectWaveAnimation();
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
