(function () {
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  async function initMolstar() {
    var mount = document.getElementById("molstar-viewer");
    if (!mount) return;

    var fallback = document.getElementById("molstar-fallback");
    var hasMolstar = window.molstar && window.molstar.Viewer && typeof window.molstar.Viewer.create === "function";
    if (!hasMolstar) {
      if (fallback) fallback.textContent = "Mol* library unavailable";
      return;
    }

    var pdbId = (mount.getAttribute("data-pdb-id") || "1CRN").toUpperCase();

    try {
      var viewer = await window.molstar.Viewer.create("molstar-viewer", {
        layoutIsExpanded: false,
        layoutShowControls: false,
        layoutShowLeftPanel: false,
        layoutShowSequence: false,
        layoutShowLog: false,
        viewportShowExpand: false,
        viewportShowSelectionMode: false,
        collapseLeftPanel: true
      });

      await viewer.loadPdb(pdbId);
      mount.classList.add("molstar-ready");
    } catch (err) {
      if (fallback) fallback.textContent = "Model failed to load";
      console.error("Mol* init failed:", err);
    }
  }

  function initQuantumField() {
    var canvas = document.getElementById("quantum-field");
    if (!canvas) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0;
    var height = 0;
    var points = [];
    var count = 28;
    var raf = null;

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = [];
      for (var i = 0; i < count; i += 1) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.26,
          vy: (Math.random() - 0.5) * 0.26,
          r: 1 + Math.random() * 1.8
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < points.length; i += 1) {
        var p = points[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -16 || p.x > width + 16) p.vx *= -1;
        if (p.y < -16 || p.y > height + 16) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(186, 233, 255, 0.75)";
        ctx.fill();

        for (var j = i + 1; j < points.length; j += 1) {
          var q = points[j];
          var dx = p.x - q.x;
          var dy = p.y - q.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 96) {
            var alpha = (1 - dist / 96) * 0.22;
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

  initMolstar();
  initQuantumField();

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
