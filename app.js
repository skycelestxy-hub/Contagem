/* ==========================================================
   APP PRINCIPAL
   - Navegação entre telas
   - Acesso à câmera
   - Loop de detecção (usa BagDetector)
   - Salvamento automático (localStorage)
   ========================================================== */
(function () {
  "use strict";

  // ---------- Referências DOM --------------------------------
  var screens = {
    home: document.getElementById("screen-home"),
    camera: document.getElementById("screen-camera"),
    history: document.getElementById("screen-history")
  };

  var btnStart = document.getElementById("btn-start");
  var btnLast = document.getElementById("btn-last");
  var btnStop = document.getElementById("btn-stop");
  var btnBackHome = document.getElementById("btn-back-home");
  var btnClearHistory = document.getElementById("btn-clear-history");

  var video = document.getElementById("video");
  var detectCanvas = document.getElementById("detect-canvas");
  var detectCtx = detectCanvas.getContext("2d", { willReadFrequently: true });
  var detectZoneEl = document.getElementById("detect-zone");
  var cameraWrap = document.querySelector(".camera-wrap");

  var counterValueEl = document.getElementById("counter-value");
  var toastEl = document.getElementById("toast");

  var historyEmpty = document.getElementById("history-empty");
  var historyData = document.getElementById("history-data");
  var historyTotal = document.getElementById("history-total");
  var historyDate = document.getElementById("history-date");

  // ---------- Estado -------------------------------------------
  var STORAGE_KEY = "sacolas_contagem";
  var stream = null;
  var loopId = null;
  var counting = false;
  var currentCount = 0;

  // ---------- Navegação entre telas ------------------------------
  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("screen--active", key === name);
    });
  }

  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toastEl.hidden = true;
    }, ms || 3200);
  }

  // ---------- Storage ---------------------------------------------
  function saveCount() {
    try {
      var payload = {
        total: currentCount,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // localStorage pode falhar (modo privado, quota etc.) — falha silenciosa e segura
      console.warn("Não foi possível salvar a contagem:", e);
    }
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSaved() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* noop */ }
  }

  // Salva automaticamente em qualquer saída/troca de contexto
  function attachAutoSaveListeners() {
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && counting) saveCount();
    });
    window.addEventListener("pagehide", function () {
      if (counting) saveCount();
    });
    window.addEventListener("beforeunload", function () {
      if (counting) saveCount();
    });
  }

  // ---------- Contador ----------------------------------------------
  function updateCounterUI() {
    counterValueEl.textContent = String(currentCount);
  }

  function incrementCount() {
    currentCount++;
    updateCounterUI();
    saveCount(); // salvamento contínuo a cada nova sacola
    pulseFeedback();
  }

  function pulseFeedback() {
    cameraWrap.classList.remove("pulse");
    // force reflow para permitir reanimar rapidamente em sequência
    void cameraWrap.offsetWidth;
    cameraWrap.classList.add("pulse");
  }

  // ---------- Câmera ---------------------------------------------------
  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Este navegador não suporta acesso à câmera.");
      return Promise.reject(new Error("getUserMedia indisponível"));
    }

    return navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment", // preferir câmera traseira em celulares
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play();
      });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    video.srcObject = null;
  }

  // ---------- Loop de detecção -------------------------------------------
  // Roda a ~10fps (intervalo fixo) para manter baixo uso de CPU,
  // suficiente para detectar objetos passando lentamente.
  var DETECT_INTERVAL_MS = 100;
  var lastDetectTime = 0;

  function detectionLoop(timestamp) {
    loopId = requestAnimationFrame(detectionLoop);

    if (!counting || video.readyState < 2) return;
    if (timestamp - lastDetectTime < DETECT_INTERVAL_MS) return;
    lastDetectTime = timestamp;

    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return;

    // Região correspondente à .detect-zone (faixa central horizontal)
    // Coordenadas em % relativas ao vídeo exibido (object-fit: cover)
    var zoneXPct = 0.06, zoneWPct = 0.88;
    var zoneYPct = 0.45, zoneHPct = 0.14;

    var sx = vw * zoneXPct;
    var sy = vh * zoneYPct;
    var sw = vw * zoneWPct;
    var sh = vh * zoneHPct;

    detectCanvas.width = BagDetector.CONFIG.sampleWidth;
    detectCanvas.height = BagDetector.CONFIG.sampleHeight;

    // desenha a região recortada do vídeo, já reduzida (leve: poucos pixels)
    detectCtx.drawImage(
      video,
      sx, sy, sw, sh,
      0, 0, detectCanvas.width, detectCanvas.height
    );

    var frame;
    try {
      frame = detectCtx.getImageData(0, 0, detectCanvas.width, detectCanvas.height);
    } catch (e) {
      return; // ex.: vídeo ainda não pronto
    }

    var result = BagDetector.processFrame(frame);
    if (result.counted) {
      incrementCount();
    }
  }

  // ---------- Fluxo: Iniciar Contagem -------------------------------------
  function handleStartCounting() {
    // Ao iniciar nova contagem, qualquer contagem salva anteriormente é apagada
    clearSaved();
    currentCount = 0;
    updateCounterUI();
    BagDetector.reset();

    startCamera()
      .then(function () {
        counting = true;
        showScreen("camera");
        saveCount(); // já registra estado inicial (0) — será atualizado a cada +1 e nas saídas
        if (!loopId) loopId = requestAnimationFrame(detectionLoop);
      })
      .catch(function (err) {
        console.warn("Erro ao acessar câmera:", err);
        toast("Permissão de câmera negada ou indisponível.");
      });
  }

  function handleStopCounting() {
    counting = false;
    saveCount();
    stopCamera();
    showScreen("home");
  }

  // ---------- Fluxo: Ver Última Contagem -----------------------------------
  function handleShowHistory() {
    var saved = loadSaved();
    if (!saved) {
      historyEmpty.hidden = false;
      historyData.hidden = true;
    } else {
      historyEmpty.hidden = true;
      historyData.hidden = false;
      historyTotal.textContent = String(saved.total);
      historyDate.textContent = formatDate(saved.savedAt);
    }
    showScreen("history");
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "-";
    }
  }

  function handleClearHistory() {
    clearSaved();
    historyEmpty.hidden = false;
    historyData.hidden = true;
    toast("Histórico apagado.");
  }

  // ---------- Eventos -----------------------------------------------------
  btnStart.addEventListener("click", handleStartCounting);
  btnLast.addEventListener("click", handleShowHistory);
  btnStop.addEventListener("click", handleStopCounting);
  btnBackHome.addEventListener("click", function () { showScreen("home"); });
  btnClearHistory.addEventListener("click", handleClearHistory);

  attachAutoSaveListeners();
  showScreen("home");
})();
