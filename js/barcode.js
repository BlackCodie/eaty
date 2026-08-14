/* ==========================================================================
   barcode.js — barcode decoding

   Uses the browser's native BarcodeDetector when it exists (Android Chrome),
   and otherwise lazily loads the vendored ZXing build. Safari has no
   BarcodeDetector, so on iPhone the ZXing path is the one that runs.

   ZXing is only fetched the first time the scanner opens (328 KB), and the
   service worker precaches it so it also works offline.
   ========================================================================== */
(function () {
  'use strict';

  const FORMATS_NATIVE = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
  let zxingPromise = null;

  /* ------------------------------------------------------------ checksum */
  /** GTIN check-digit validation — guards against bogus reads. */
  function validGtin(code) {
    if (!/^\d+$/.test(code)) return false;
    if ([8, 12, 13, 14].indexOf(code.length) === -1) return false;
    const d = code.split('').map(Number);
    const check = d.pop();
    let sum = 0;
    for (let i = d.length - 1, w = 3; i >= 0; i--, w = (w === 3 ? 1 : 3)) sum += d[i] * w;
    return (10 - (sum % 10)) % 10 === check;
  }

  /** Alternative encodings of the same product, for the lookup fallback. */
  function variants(code) {
    const out = [code];
    if (code.length === 12) out.push('0' + code);                 // UPC-A -> EAN-13
    if (code.length === 13 && code[0] === '0') out.push(code.slice(1));
    if (code.length === 14 && code[0] === '0') out.push(code.slice(1));
    return out.filter((v, i, a) => a.indexOf(v) === i);
  }

  /* --------------------------------------------------------- ZXing load */
  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (zxingPromise) return zxingPromise;
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/zxing.min.js';
      s.async = true;
      s.onload = () => window.ZXing
        ? resolve(window.ZXing)
        : reject(new Error('Barcode decoder loaded but did not initialise'));
      s.onerror = () => {
        zxingPromise = null;
        reject(new Error('Could not load the barcode decoder'));
      };
      document.head.appendChild(s);
    });
    return zxingPromise;
  }

  /* ------------------------------------------------------------ decoder */
  /**
   * Returns a decoder: { decode(imageData) -> code|null, engine, close() }
   * `decode` is synchronous for ZXing and async for the native detector, so
   * callers should always await the result.
   */
  async function createDecoder() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS_NATIVE.filter(f => supported.indexOf(f) !== -1);
        if (formats.length) {
          const det = new window.BarcodeDetector({ formats });
          return {
            engine: 'native',
            async decode(_imageData, canvas) {
              const hits = await det.detect(canvas);
              for (const h of hits) {
                const v = String(h.rawValue || '').trim();
                if (validGtin(v)) return v;
              }
              return null;
            },
            close() {}
          };
        }
      } catch (_) { /* fall through to ZXing */ }
    }

    const ZX = await loadZXing();
    const hints = new Map();
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
      ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8,
      ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E,
      ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.ITF
    ]);
    hints.set(ZX.DecodeHintType.TRY_HARDER, true);
    const reader = new ZX.MultiFormatReader();
    reader.setHints(hints);

    function attempt(source) {
      try {
        const res = reader.decodeWithState(new ZX.BinaryBitmap(new ZX.HybridBinarizer(source)));
        const v = String(res.getText() || '').trim();
        return validGtin(v) ? v : null;
      } catch (_) {
        return null;                     // NotFoundException on most frames
      }
    }

    return {
      engine: 'zxing',
      async decode(imageData) {
        const { width: w, height: h, data } = imageData;
        // Green-favouring grayscale, the weighting ZXing itself uses.
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
          gray[i] = (data[j] + 2 * data[j + 1] + data[j + 2]) >> 2;
        }
        const src = new ZX.RGBLuminanceSource(gray, w, h);
        return attempt(src) || attempt(src.invert());   // handles inverted labels
      },
      close() { try { reader.reset(); } catch (_) {} }
    };
  }

  window.Barcode = { createDecoder, validGtin, variants, loadZXing };
})();
