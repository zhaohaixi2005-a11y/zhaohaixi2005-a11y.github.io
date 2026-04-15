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

  function initProteinViewer() {
    var mount = document.getElementById("protein-stage");
    if (!mount) return;

    var fallback = document.getElementById("protein-fallback");
    var source = mount.getAttribute("data-pdb-source") || "rcsb://1crn";

    function onFail(text, err) {
      if (fallback) fallback.textContent = text;
      if (err) console.error(err);
    }

    function bootNgl() {
      if (!window.NGL || !window.NGL.Stage) {
        onFail("3D engine unavailable");
        return;
      }

      var stage = new window.NGL.Stage("protein-stage", {
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
        .then(function (component) {
          component.addRepresentation("cartoon", {
            colorScheme: "residueindex",
            opacity: 0.95,
            roughness: 0.28,
            metalness: 0.08
          });
          component.addRepresentation("ball+stick", {
            sele: "hetero and not water",
            opacity: 0.86,
            scale: 2
          });
          component.autoView();
          if (!reducedMotion) stage.setSpin([0, 1, 0], 0.004);
          mount.classList.add("ready");
        })
        .catch(function (err) {
          onFail("3D model failed to load", err);
        });
    }

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
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          var alpha = (1 - dist / 140) * 0.55;
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
    backgroundState.ctx = canvas.getContext("2d");
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

    startFragmentAnimation();
  }

  function startFragmentAnimation() {
    if (reducedMotion || fragmentState.rafId || !fragmentState.ctx) return;
    fragmentState.rafId = window.requestAnimationFrame(animateFragments);
  }

  function stopFragmentAnimation() {
    if (!fragmentState.rafId) return;
    window.cancelAnimationFrame(fragmentState.rafId);
    fragmentState.rafId = 0;
  }

  function initCursorFragments() {
    var canvas = document.getElementById("cursor-fragments-canvas");
    if (!canvas) return;

    fragmentState.canvas = canvas;
    fragmentState.ctx = canvas.getContext("2d");
    if (!fragmentState.ctx) return;

    resizeFragmentCanvas();
    startFragmentAnimation();

    if (!reducedMotion) {
      var onMouseMove = function (ev) {
        var now = performance.now();
        if (now - fragmentState.lastSpawnAt < 96) return;
        fragmentState.lastSpawnAt = now;
        spawnCodeFragments(ev.clientX, ev.clientY);
      };
      window.addEventListener("mousemove", onMouseMove);
      cleanups.push(function () {
        window.removeEventListener("mousemove", onMouseMove);
      });
    }

    var onResize = function () {
      resizeFragmentCanvas();
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

    if (fragmentState.ctx) {
      resizeFragmentCanvas();
      fragmentState.fragments = [];
      startFragmentAnimation();
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
      stopFragmentAnimation();
      cancelRefreshFrames();
      return;
    }
    scheduleInteractiveRefresh();
  });

  window.addEventListener("pagehide", function () {
    stopBackgroundAnimation();
    stopFragmentAnimation();
    cancelRefreshFrames();
  });

  window.addEventListener("pageshow", function () {
    scheduleInteractiveRefresh();
  });
})();
