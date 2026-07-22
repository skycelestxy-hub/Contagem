/* ==========================================================
   DETECTOR DE SACOLAS — Visão computacional pura (sem IA/ML)
   ==========================================================
   Estratégia (calibrada com fotos reais de sacolas sobre piso
   de madeira/laminado):

   1. Lê os pixels de uma ZONA DE DETECÇÃO fixa (uma faixa
      horizontal no centro do vídeo), em baixa resolução,
      para manter o processamento leve.

   2. Classifica cada pixel como "candidato a sacola" se ele for
      claro e de baixa saturação (sacolas brancas/translúcidas
      refletem luz de forma neutra e clara). Isso sozinho NÃO
      é suficiente: pisos de madeira/laminado também têm pontos
      de brilho (reflexo de luz) igualmente claros e neutros.

   3. Diferencial chave — CONTINUIDADE ESPACIAL: uma sacola forma
      uma mancha (blob) lisa e contígua, enquanto o brilho do piso
      aparece entremeado pelas linhas/ripas escuras da textura da
      madeira, quebrando a região clara em fragmentos pequenos.
      Por isso, em vez de só contar a % de pixels claros na zona,
      o detector mede o MAIOR TRECHO CONTÍNUO (run) de pixels
      candidatos em cada linha da amostra. Reflexos de piso geram
      trechos curtos e fragmentados; uma sacola gera um trecho
      longo e contínuo. Essa métrica é o principal sinal de entrada
      do objeto.

   4. Uma proporção mínima de pixels candidatos (minPixelRatio)
      é usada como checagem de sanidade, evitando que uma única
      linha de ruído (ex.: um fio de brilho) dispare a contagem.

   5. Quando o maior trecho contínuo cruza o limiar de entrada
      (objeto ocupando a zona) e depois cai abaixo do limiar de
      saída (objeto saiu), soma-se +1. Esse ciclo entra→sai evita
      contar o mesmo objeto várias vezes enquanto ele permanece
      na câmera.

   Este módulo expõe uma interface simples e estável
   (BagDetector.processFrame) para que, no futuro, a lógica
   interna possa ser substituída por outra técnica SEM alterar
   o restante do sistema — basta manter a mesma assinatura de
   entrada/saída.
   ========================================================== */

var BagDetector = (function () {
  "use strict";

  // ---- Parâmetros ajustáveis (calibrados com fotos reais) ----
  var CONFIG = {
    sampleWidth: 96,        // resolução interna de amostragem (baixa = rápido)
    sampleHeight: 40,
    brightnessMin: 135,     // mínimo de luminosidade p/ "claro" (0-255)
    saturationMax: 0.18,    // máxima saturação p/ considerar "neutro" (0-1)
    minPixelRatio: 0.05,    // % mínimo de pixels claros na zona (sanidade)
    enterThreshold: 0.11,   // maior trecho contínuo (run) p/ "objeto entrando" (0-1 da largura)
    exitThreshold: 0.06,    // trecho contínuo p/ considerar que o objeto "saiu"
    minConsecutiveFrames: 2 // frames seguidos acima do limiar antes de confirmar entrada
  };

  var state = {
    present: false,        // se há atualmente um objeto candidato na zona
    aboveCount: 0,          // frames consecutivos acima do enterThreshold
    lastRatio: 0,
    lastRun: 0
  };

  function reset() {
    state.present = false;
    state.aboveCount = 0;
    state.lastRatio = 0;
    state.lastRun = 0;
  }

  /**
   * Converte RGB em luminosidade (0-255) e saturação (0-1),
   * sem calcular matiz (H) completo pois não é necessário aqui.
   */
  function luminanceAndSaturation(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var luminance = (max + min) / 2;
    var saturation = max === 0 ? 0 : (max - min) / max;
    return { luminance: luminance, saturation: saturation };
  }

  /**
   * Processa um frame da zona de detecção.
   * @param {ImageData} imageData - pixels já recortados da zona (baixa resolução)
   * @returns {{ratio:number, runRatio:number, counted:boolean}}
   */
  function processFrame(imageData) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var totalPixels = w * h;
    var brightPixels = 0;
    var maxRun = 0;

    for (var y = 0; y < h; y++) {
      var currentRun = 0;
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var ls = luminanceAndSaturation(r, g, b);
        var isCandidate = ls.luminance >= CONFIG.brightnessMin && ls.saturation <= CONFIG.saturationMax;

        if (isCandidate) {
          brightPixels++;
          currentRun++;
          if (currentRun > maxRun) maxRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
    }

    var pixelRatio = brightPixels / totalPixels;
    var runRatio = maxRun / w;
    state.lastRatio = pixelRatio;
    state.lastRun = runRatio;

    var counted = false;
    var hasEnoughMass = pixelRatio >= CONFIG.minPixelRatio;

    if (!state.present) {
      // aguardando objeto entrar na zona: precisa de trecho contínuo
      // longo E massa mínima de pixels claros (evita ruído de 1 linha)
      if (runRatio >= CONFIG.enterThreshold && hasEnoughMass) {
        state.aboveCount++;
        if (state.aboveCount >= CONFIG.minConsecutiveFrames) {
          state.present = true; // objeto confirmado dentro da zona
        }
      } else {
        state.aboveCount = 0;
      }
    } else {
      // objeto já presente; aguardando ele sair para liberar nova contagem
      if (runRatio <= CONFIG.exitThreshold) {
        state.present = false;
        state.aboveCount = 0;
        counted = true; // objeto passou completamente -> soma +1
      }
    }

    return { ratio: pixelRatio, runRatio: runRatio, counted: counted };
  }

  return {
    CONFIG: CONFIG,
    processFrame: processFrame,
    reset: reset
  };
})();
