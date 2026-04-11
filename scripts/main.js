(function () {
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  function initSiteParticles() {
    var canvas = document.getElementById("site-particles");
    if (!canvas) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0;
    var height = 0;
    var points = [];
    var count = 0;
    var raf = null;

    function getCount(w, h) {
      return Math.max(48, Math.min(130, Math.floor((w * h) / 18000)));
    }

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      count = getCount(width, height);
      points = [];
      for (var i = 0; i < count; i += 1) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 0.8 + Math.random() * 1.4
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < points.length; i += 1) {
        var p = points[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -10 || p.x > width + 10) p.vx *= -1;
        if (p.y < -10 || p.y > height + 10) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(186, 233, 255, 0.62)";
        ctx.fill();

        for (var j = i + 1; j < points.length; j += 1) {
          var q = points[j];
          var dx = p.x - q.x;
          var dy = p.y - q.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            var alpha = (1 - dist / 110) * 0.18;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = "rgba(117, 204, 255," + alpha.toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      raf = window.requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("beforeunload", function () {
      if (raf) window.cancelAnimationFrame(raf);
    });
  }

  async function initProteinViewer() {
    var mount = document.getElementById("protein-stage");
    if (!mount) return;

    var fallback = document.getElementById("protein-fallback");
    if (!window.NGL || !window.NGL.Stage) {
      if (fallback) fallback.textContent = "3D engine unavailable";
      return;
    }

    var source = mount.getAttribute("data-pdb-source") || "rcsb://1crn";
    try {
      var stage = new window.NGL.Stage("protein-stage", {
        backgroundColor: "transparent",
        quality: "medium",
        sampleLevel: 0
      });

      window.addEventListener("resize", function () {
        stage.handleResize();
      });

      var component = await stage.loadFile(source, { defaultRepresentation: false });
      component.addRepresentation("cartoon", {
        colorScheme: "chainid",
        opacity: 0.96,
        aspectRatio: 5,
        metalness: 0.08,
        roughness: 0.28
      });
      component.addRepresentation("ball+stick", {
        sele: "hetero and not water",
        opacity: 0.9,
        scale: 2
      });
      component.autoView();
      stage.setSpin([0, 1, 0], 0.0045);

      mount.classList.add("ready");
    } catch (err) {
      if (fallback) fallback.textContent = "3D model failed to load";
      console.error("NGL init error:", err);
    }
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

  initSiteParticles();
  initProteinViewer();
  initNoNavCards();

  var items = document.querySelectorAll(".reveal");
  if (!items.length || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  }, { threshold: 0.15 });

  items.forEach(function (el) { io.observe(el); });
})();
