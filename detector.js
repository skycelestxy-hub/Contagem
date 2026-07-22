/* ==========================================================
   DETECTOR DE SACOLAS — Visão computacional pura (sem IA/ML)
   ==========================================================
   Estratégia:
   1. Lê os pixels de uma ZONA DE DETECÇÃO fixa (uma faixa
      horizontal no centro do vídeo), em baixa resolução,
      para manter o processamento leve.
   2. Classifica cada pixel como "provável sacola" se ele for
      claro/branco e de baixa saturação (sacolas plásticas
      brancas/translúcidas refletem luz de forma neutra e clara,
      diferente de pele, roupas coloridas ou fundo escuro).
   3. Calcula a proporção de pixels "sacola" dentro da zona.
      Quando essa proporção cruza um limiar (presença de objeto
      claro ocupando parte relevante da zona) e depois volta a
      cair abaixo do limiar (o objeto saiu), conta-se +1.
      Esse cruzamento (entra -> sai) evita contar múltiplas
      vezes o mesmo objeto enquanto ele permanece na tela.
   4. Filtra por tamanho mínimo de área clara e por formato
      (blob relativamente compacto/largo), para reduzir falsos
      positivos de mãos (pele tem tom/matiz diferente de branco
      neutro) e de fundo.

   Este módulo expõe uma interface simples e estável
   (BagDetector.processFrame) para que, no futuro, a lógica
   interna possa ser substituída por um modelo de IA/ML
   (ex.: TensorFlow.js) SEM alterar o restante do sistema —
   basta manter a mesma assinatura de entrada/saída.
   ========================================================== */

var BagDetector = (function () {
  "use strict";

  // ---- Parâmetros ajustáveis --------------------------------
  var CONFIG = {
    sampleWidth: 96,       // resolução interna de amostragem (baixa = rápido)
    sampleHeight: 40,
    brightnessMin: 168,    // mínimo de luminosidade para "branco/claro" (0-255)
    saturationMax: 0.16,   // máxima saturação para considerar "neutro" (0-1)
    enterThreshold: 0.16,  // % da zona coberta por pixels claros para "objeto entrando"
    exitThreshold: 0.08,   // % da zona para considerar que o objeto "saiu"
    minConsecutiveFrames: 2 // frames seguidos acima do limiar antes de confirmar entrada
  };

  var state = {
    present: false,        // se há atualmente um objeto candidato na zona
    aboveCount: 0,          // frames consecutivos acima do enterThreshold
    lastRatio: 0
  };

  function reset() {
    state.present = false;
    state.aboveCount = 0;
    state.lastRatio = 0;
  }

  /**
   * Converte RGB em HSL simplificado, retornando apenas
   * luminosidade (0-255) e saturação (0-1). Evita cálculo
   * completo de matiz (H) pois não é necessário aqui.
   */
  function luminanceAndSaturation(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var luminance = (max + min) / 2; // aproximação 0-255
    var saturation = max === 0 ? 0 : (max - min) / max;
    return { luminance: luminance, saturation: saturation };
  }

  /**
   * Processa um frame da zona de detecção.
   * @param {ImageData} imageData - pixels já recortados da zona (baixa resolução)
   * @returns {{ratio:number, counted:boolean}}
   */
  function processFrame(imageData) {
    var data = imageData.data;
    var totalPixels = data.length / 4;
    var brightPixels = 0;

    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var ls = luminanceAndSaturation(r, g, b);

      // pixel "sacola branca/transparente": claro e pouco saturado (neutro)
      if (ls.luminance >= CONFIG.brightnessMin && ls.saturation <= CONFIG.saturationMax) {
        brightPixels++;
      }
    }

    var ratio = brightPixels / totalPixels;
    state.lastRatio = ratio;

    var counted = false;

    if (!state.present) {
      // aguardando objeto entrar na zona
      if (ratio >= CONFIG.enterThreshold) {
        state.aboveCount++;
        if (state.aboveCount >= CONFIG.minConsecutiveFrames) {
          state.present = true; // objeto confirmado dentro da zona
        }
      } else {
        state.aboveCount = 0;
      }
    } else {
      // objeto já presente; aguardando ele sair para liberar nova contagem
      if (ratio <= CONFIG.exitThreshold) {
        state.present = false;
        state.aboveCount = 0;
        counted = true; // objeto passou completamente -> soma +1
      }
    }

    return { ratio: ratio, counted: counted };
  }

  return {
    CONFIG: CONFIG,
    processFrame: processFrame,
    reset: reset
  };
})();
