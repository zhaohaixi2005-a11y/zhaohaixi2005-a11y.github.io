(function () {
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cleanups = [];

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
    var proteinRepresentations = {
      cartoon: [],
      surface: []
    };
    var activeMode = "cartoon";

    function onFail(text, err) {
      if (fallback) fallback.textContent = text;
      if (err) console.error(err);
    }

    function syncModeButtons(mode) {
      modeButtons.forEach(function (button) {
        var isActive = button.getAttribute("data-protein-mode") === mode;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function setMode(mode) {
      activeMode = mode === "surface" ? "surface" : "cartoon";

      ["cartoon", "surface"].forEach(function (representationMode) {
        proteinRepresentations[representationMode].forEach(function (representation) {
          representation.setVisibility(representationMode === activeMode);
        });
      });

      syncModeButtons(activeMode);

      if (stage && stage.viewer) {
        stage.viewer.requestRender();
      }
    }

    function bootNgl() {
      if (!window.NGL || !window.NGL.Stage) {
        onFail("3D engine unavailable");
        return;
      }

      stage = new window.NGL.Stage("protein-stage", {
        backgroundColor: "transparent",
        quality: "medium",
        sampleLevel: 1
      });

      var onResize = function () {
        stage.handleResize();
      };
      window.addEventListener("resize", onResize);
      cleanups.push(function () {
        window.removeEventListener("resize", onResize);
      });

      stage
        .loadFile(source, { defaultRepresentation: false })
        .then(function (loadedComponent) {
          var component = loadedComponent;

          proteinRepresentations.cartoon.push(
            component.addRepresentation("cartoon", {
              sele: ":A and protein",
              colorScheme: "uniform",
              colorValue: 0x56c2ff,
              opacity: 0.98,
              flatShaded: true
            })
          );
          proteinRepresentations.cartoon.push(
            component.addRepresentation("cartoon", {
              sele: ":B and protein",
              colorScheme: "uniform",
              colorValue: 0x7cf7d4,
              opacity: 0.98,
              flatShaded: true
            })
          );

          proteinRepresentations.surface.push(
            component.addRepresentation("surface", {
              sele: ":A and protein",
              colorScheme: "uniform",
              colorValue: 0x56c2ff,
              opacity: 0.86,
              flatShaded: true,
              useWorker: true
            })
          );
          proteinRepresentations.surface.push(
            component.addRepresentation("surface", {
              sele: ":B and protein",
              colorScheme: "uniform",
              colorValue: 0x7cf7d4,
              opacity: 0.86,
              flatShaded: true,
              useWorker: true
            })
          );

          component.addRepresentation("ball+stick", {
            sele: "hetero and not water",
            colorScheme: "element",
            opacity: 0.96,
            scale: 2.2
          });

          setMode(activeMode);
          component.autoView();
          if (!reducedMotion) stage.setSpin([0, 1, 0], 0.004);
          mount.classList.add("ready");
        })
        .catch(function (err) {
          onFail("3D model failed to load", err);
        });
    }

    modeButtons.forEach(function (button) {
      var onClick = function () {
        setMode(button.getAttribute("data-protein-mode"));
      };
      button.addEventListener("click", onClick);
      cleanups.push(function () {
        button.removeEventListener("click", onClick);
      });
    });

    syncModeButtons(activeMode);

    if (window.NGL && window.NGL.Stage) {
      bootNgl();
      return;
    }

    loadScript("https://unpkg.com/ngl@2.0.0-dev.37/dist/ngl.js")
      .then(bootNgl)
      .catch(function (err) {
        onFail("3D engine unavailable", err);
      });
  }

  var projectWaveState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    rafId: 0,
    lastTs: 0,
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

    s.dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    projectWaveState.rafId = 0;
    drawProjectWaveFrame(timestamp);
    startProjectWaveAnimation();
  }

  function startProjectWaveAnimation() {
    if (reducedMotion || projectWaveState.rafId || !projectWaveState.ctx) return;
    projectWaveState.rafId = window.requestAnimationFrame(animateProjectWave);
  }

  function stopProjectWaveAnimation() {
    if (!projectWaveState.rafId) return;
    window.cancelAnimationFrame(projectWaveState.rafId);
    projectWaveState.rafId = 0;
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
      if (projectWaveState.resizeRaf) return;
      projectWaveState.resizeRaf = window.requestAnimationFrame(function () {
        projectWaveState.resizeRaf = 0;
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
    rafId: 0
  };

  function resizeParticleCanvas() {
    var s = backgroundState;
    if (!s.canvas || !s.ctx) return;

    s.dpr = Math.min(window.devicePixelRatio || 1, 2);
    s.width = Math.max(s.canvas.clientWidth || 0, window.innerWidth || 0, 1);
    s.height = Math.max(s.canvas.clientHeight || 0, window.innerHeight || 0, 1);
    s.canvas.width = Math.max(1, Math.floor(s.width * s.dpr));
    s.canvas.height = Math.max(1, Math.floor(s.height * s.dpr));
    s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);

    var particleCount = Math.max(58, Math.min(180, Math.floor((s.width * s.height) / 14800)));
    s.particles = [];
    for (var i = 0; i < particleCount; i += 1) {
      s.particles.push({
        x: Math.random() * s.width,
        y: Math.random() * s.height,
        vx: (Math.random() - 0.5) * 0.62,
        vy: (Math.random() - 0.5) * 0.62,
        r: 1 + Math.random() * 2.1
      });
    }
  }

  function drawParticleFrame() {
    var s = backgroundState;
    var ctx = s.ctx;
    if (!ctx) return;
    var maxLinkDistance = 140;
    var maxLinkDistanceSq = maxLinkDistance * maxLinkDistance;

    ctx.clearRect(0, 0, s.width, s.height);

    for (var i = 0; i < s.particles.length; i += 1) {
      var p = s.particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -12 || p.x > s.width + 12) p.vx *= -1;
      if (p.y < -12 || p.y > s.height + 12) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(212, 244, 255, 0.98)";
      ctx.fill();
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(146, 223, 255, 0.8)";

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
      ctx.shadowBlur = 0;
    }
  }

  function startBackgroundAnimation() {
    if (reducedMotion || backgroundState.rafId || !backgroundState.ctx) return;
    backgroundState.rafId = window.requestAnimationFrame(animateBackground);
  }

  function stopBackgroundAnimation() {
    if (!backgroundState.rafId) return;
    window.cancelAnimationFrame(backgroundState.rafId);
    backgroundState.rafId = 0;
  }

  function animateBackground() {
    backgroundState.rafId = 0;
    drawParticleFrame();
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

  var fragmentState = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    fragments: [],
    rafId: 0,
    maxFragments: 92,
    lastSpawnAt: 0,
    isMutedOverViewer: false,
    chars: ["A", "T", "G", "C", "0", "1", "{", "}", "<", ">", "/", "\\", "[", "]", "(", ")", ";", ":", "+", "-", "*"]
  };

  function resizeFragmentCanvas() {
    var s = fragmentState;
    if (!s.canvas || !s.ctx) return;

    s.dpr = Math.min(window.devicePixelRatio || 1, 2);
    s.width = Math.max(s.canvas.clientWidth || 0, window.innerWidth || 0, 1);
    s.height = Math.max(s.canvas.clientHeight || 0, window.innerHeight || 0, 1);
    s.canvas.width = Math.max(1, Math.floor(s.width * s.dpr));
    s.canvas.height = Math.max(1, Math.floor(s.height * s.dpr));
    s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  }

  function spawnCodeFragments(x, y) {
    var s = fragmentState;
    if (s.fragments.length >= s.maxFragments) return;

    var burst = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < burst; i += 1) {
      if (s.fragments.length >= s.maxFragments) break;
      var angle = Math.random() * Math.PI * 2;
      var speed = 0.28 + Math.random() * 0.6;
      s.fragments.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.08,
        life: 0,
        ttl: 44 + Math.random() * 28,
        size: 10 + Math.random() * 3.5,
        char: s.chars[Math.floor(Math.random() * s.chars.length)]
      });
    }
  }

  function animateFragments() {
    var s = fragmentState;
    var ctx = s.ctx;
    if (!ctx) return;

    s.rafId = 0;
    ctx.clearRect(0, 0, s.width, s.height);

    for (var i = s.fragments.length - 1; i >= 0; i -= 1) {
      var f = s.fragments[i];
      f.life += 1;
      if (f.life > f.ttl) {
        s.fragments.splice(i, 1);
        continue;
      }

      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.vr;
      f.vy += 0.003;
      f.vx *= 0.994;

      var alpha = (1 - f.life / f.ttl) * 0.96;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.font = f.size.toFixed(1) + "px JetBrains Mono, monospace";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(122, 223, 255, 0.95)";
      ctx.fillStyle = "rgba(232, 250, 255," + alpha.toFixed(3) + ")";
      ctx.fillText(f.char, 0, 0);
      ctx.strokeStyle = "rgba(122, 223, 255," + (alpha * 0.78).toFixed(3) + ")";
      ctx.lineWidth = 0.45;
      ctx.strokeText(f.char, 0, 0);
      ctx.restore();
    }

    if (s.fragments.length) {
      startFragmentAnimation();
    }
  }

  function startFragmentAnimation() {
    if (reducedMotion || fragmentState.rafId || !fragmentState.ctx || !fragmentState.fragments.length) return;
    fragmentState.rafId = window.requestAnimationFrame(animateFragments);
  }

  function stopFragmentAnimation() {
    if (!fragmentState.rafId) return;
    window.cancelAnimationFrame(fragmentState.rafId);
    fragmentState.rafId = 0;
  }

  function clearFragments() {
    if (!fragmentState.ctx) return;
    fragmentState.fragments = [];
    fragmentState.ctx.clearRect(0, 0, fragmentState.width, fragmentState.height);
    stopFragmentAnimation();
  }

  function initViewerFragmentMuteZone() {
    var muteTarget = document.querySelector(".hero-visual");
    if (!muteTarget) return;

    var onEnter = function () {
      fragmentState.isMutedOverViewer = true;
      clearFragments();
    };

    var onLeave = function () {
      fragmentState.isMutedOverViewer = false;
    };

    muteTarget.addEventListener("pointerenter", onEnter);
    muteTarget.addEventListener("pointerleave", onLeave);
    cleanups.push(function () {
      muteTarget.removeEventListener("pointerenter", onEnter);
      muteTarget.removeEventListener("pointerleave", onLeave);
    });
  }

  function initCursorFragments() {
    var canvas = document.getElementById("cursor-fragments-canvas");
    if (!canvas) return;

    fragmentState.canvas = canvas;
    fragmentState.ctx = get2dContext(canvas);
    if (!fragmentState.ctx) return;

    resizeFragmentCanvas();

    if (!reducedMotion) {
      var onMouseMove = function (ev) {
        if (fragmentState.isMutedOverViewer) return;
        var now = performance.now();
        if (now - fragmentState.lastSpawnAt < 96) return;
        fragmentState.lastSpawnAt = now;
        spawnCodeFragments(ev.clientX, ev.clientY);
        startFragmentAnimation();
      };
      window.addEventListener("mousemove", onMouseMove);
      cleanups.push(function () {
        window.removeEventListener("mousemove", onMouseMove);
      });
    }

    var onResize = function () {
      resizeFragmentCanvas();
      if (!fragmentState.fragments.length) return;
      startFragmentAnimation();
    };
    window.addEventListener("resize", onResize);
    cleanups.push(function () {
      window.removeEventListener("resize", onResize);
      stopFragmentAnimation();
    });
  }

  function initNoNavCards() {
    var cards = document.querySelectorAll(".no-nav-link");
    cards.forEach(function (card) {
      card.addEventListener("click", function (event) {
        event.preventDefault();
        card.classList.add("is-tapped");
        window.setTimeout(function () {
          card.classList.remove("is-tapped");
        }, 220);
      });
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
  }

  initSiteParticles();
  initCursorFragments();
  initViewerFragmentMuteZone();
  initProjectWaveCanvas();
  initProteinViewer();
  initNoNavCards();
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

    if (fragmentState.ctx) {
      resizeFragmentCanvas();
      fragmentState.ctx.clearRect(0, 0, fragmentState.width, fragmentState.height);
      fragmentState.fragments = [];
      stopFragmentAnimation();
    }
  }

  function scheduleInteractiveRefresh() {
    cancelRefreshFrames();
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
      stopFragmentAnimation();
      cancelRefreshFrames();
      return;
    }
    scheduleInteractiveRefresh();
  });

  window.addEventListener("pagehide", function () {
    stopBackgroundAnimation();
    stopProjectWaveAnimation();
    stopFragmentAnimation();
    cancelRefreshFrames();
  });

  window.addEventListener("pageshow", function () {
    scheduleInteractiveRefresh();
  });
})();
