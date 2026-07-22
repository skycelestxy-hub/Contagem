/* ==========================================================
   FUNDO ANIMADO — objetos caindo lentamente
   Canvas 2D puro, sem bibliotecas. Leve: poucos itens,
   sem sombras/blur pesados, pausa quando a aba não está visível.
   ========================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  var ctx = canvas.getContext("2d", { alpha: false });

  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var items = [];
  var running = true;
  var rafId = null;

  // Formas simples desenhadas em vetor (sem imagens externas = leve e rápido)
  var SHAPES = ["box", "bag", "bottle", "package"];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function makeItem() {
    var size = rand(18, 34);
    return {
      shape: SHAPES[(Math.random() * SHAPES.length) | 0],
      x: rand(0, W),
      y: rand(-H, 0),
      size: size,
      speed: rand(6, 16) / 60, // px por frame (lento)
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-0.004, 0.004),
      opacity: rand(0.12, 0.28),
      hue: rand(30, 45) // tons próximos ao âmbar, discretos
    };
  }

  function initItems() {
    var count = W < 600 ? 10 : 18; // menos itens em telas pequenas
    items = [];
    for (var i = 0; i < count; i++) items.push(makeItem());
  }

  function drawShape(it) {
    var s = it.size;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.globalAlpha = it.opacity;
    ctx.strokeStyle = "hsl(" + it.hue + ", 60%, 65%)";
    ctx.fillStyle = "hsla(" + it.hue + ", 60%, 55%, 0.15)";
    ctx.lineWidth = 1.4;

    switch (it.shape) {
      case "box":
        ctx.beginPath();
        ctx.rect(-s / 2, -s / 2, s, s);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
        ctx.moveTo(0, -s / 2); ctx.lineTo(0, s / 2);
        ctx.stroke();
        break;
      case "bag":
        ctx.beginPath();
        ctx.moveTo(-s / 2.4, -s / 2);
        ctx.lineTo(s / 2.4, -s / 2);
        ctx.lineTo(s / 2, s / 2);
        ctx.lineTo(-s / 2, s / 2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.arc(-s / 5, -s / 2, s / 6, Math.PI, 0);
        ctx.arc(s / 5, -s / 2, s / 6, Math.PI, 0);
        ctx.stroke();
        break;
      case "bottle":
        ctx.beginPath();
        ctx.rect(-s / 6, -s / 2, s / 3, s / 5);
        ctx.moveTo(-s / 5, -s / 2 + s / 5);
        ctx.lineTo(-s / 3, -s / 8);
        ctx.lineTo(-s / 3, s / 2);
        ctx.lineTo(s / 3, s / 2);
        ctx.lineTo(s / 3, -s / 8);
        ctx.lineTo(s / 5, -s / 2 + s / 5);
        ctx.fill(); ctx.stroke();
        break;
      case "package":
        ctx.beginPath();
        ctx.rect(-s / 2, -s / 3, s, s / 1.6);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.y += it.speed * 16; // aprox. compensação de frame
      it.rot += it.rotSpeed * 16;
      if (it.y - it.size > H) {
        it.y = -it.size;
        it.x = rand(0, W);
      }
      drawShape(it);
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Pausa a animação quando a aba não está visível -> economiza CPU/bateria
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  window.addEventListener("resize", function () {
    resize();
    initItems();
  }, { passive: true });

  resize();
  initItems();
  start();
})();
