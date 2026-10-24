/* Protection PDF : chiffrement standard (RC4 128 bits, révision 3).
 * Le fichier s'ouvre SANS mot de passe, s'imprime, mais ne peut être ni modifié, ni annoté, ni recopié
 * sans le mot de passe propriétaire. Aucune bibliothèque externe : MD5 et RC4 sont écrits ici.
 * Usage : AvecProtect.apply(PDFLib, pdfDoc, ownerPassword)  -> à appeler juste avant pdfDoc.save({useObjectStreams:false}) */
(function (exports) {
'use strict';
function md5(bytes) {
    var K = [], S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    var len = bytes.length, n = ((len + 8) >> 6) + 1, buf = new Uint8Array(n * 64);
    buf.set(bytes); buf[len] = 0x80;
    var bits = len * 8, dv = new DataView(buf.buffer);
    dv.setUint32(n * 64 - 8, bits >>> 0, true); dv.setUint32(n * 64 - 4, Math.floor(bits / 4294967296), true);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var blk = 0; blk < n; blk++) {
        var M = [];
        for (var j = 0; j < 16; j++) M[j] = dv.getUint32(blk * 64 + j * 4, true);
        var A = a0, B = b0, C = c0, D = d0;
        for (var k = 0; k < 64; k++) {
            var F, g;
            if (k < 16) { F = (B & C) | (~B & D); g = k; }
            else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
            else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * k) % 16; }
            F = (F + A + K[k] + M[g]) >>> 0;
            A = D; D = C; C = B;
            B = (B + ((F << S[k]) | (F >>> (32 - S[k])))) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    var out = new Uint8Array(16), o = new DataView(out.buffer);
    o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true);
    return out;
}
function rc4(key, data) {
    var s = new Uint8Array(256), i, j = 0, t;
    for (i = 0; i < 256; i++) s[i] = i;
    for (i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; t = s[i]; s[i] = s[j]; s[j] = t; }
    var out = new Uint8Array(data.length); i = 0; j = 0;
    for (var k = 0; k < data.length; k++) {
        i = (i + 1) & 255; j = (j + s[i]) & 255; t = s[i]; s[i] = s[j]; s[j] = t;
        out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
    }
    return out;
}
var PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
function padPwd(str) {
    var b = []; str = String(str || '');
    for (var i = 0; i < str.length && b.length < 32; i++) b.push(str.charCodeAt(i) & 255);
    var out = new Uint8Array(32); out.set(b); out.set(PAD.subarray(0, 32 - b.length), b.length);
    return out;
}
function concat() {
    var n = 0, i; for (i = 0; i < arguments.length; i++) n += arguments[i].length;
    var out = new Uint8Array(n), p = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], p); p += arguments[i].length; }
    return out;
}
function xorKey(key, v) { var o = new Uint8Array(key.length); for (var i = 0; i < key.length; i++) o[i] = key[i] ^ v; return o; }
function randomBytes(n) {
    var b = new Uint8Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else { var nc = require('crypto').randomBytes(n); b.set(nc); }
    return b;
}
// Droits accordés : impression (normale et haute qualité) uniquement.
var PERM = (0xFFFFF0C0 | 4 | 2048) | 0;

function apply(PDFLib, pdf, ownerPwd) {
    var ctx = pdf.context, N = PDFLib.PDFName;
    if (!ownerPwd) ownerPwd = Array.prototype.map.call(randomBytes(12), function (x) { return (x % 36).toString(36); }).join('');
    // O : mot de passe propriétaire (algorithme 3, R3)
    var h = md5(padPwd(ownerPwd)); for (var i = 0; i < 50; i++) h = md5(h);
    var okey = h.subarray(0, 16), O = rc4(okey, padPwd(''));
    for (i = 1; i <= 19; i++) O = rc4(xorKey(okey, i), O);
    // Identifiant du fichier
    var id = randomBytes(16);
    var p = new Uint8Array(4); new DataView(p.buffer).setInt32(0, PERM, true);
    // Clé de chiffrement (algorithme 2, R3, mot de passe utilisateur vide)
    var k = md5(concat(padPwd(''), O, p, id)); for (i = 0; i < 50; i++) k = md5(k.subarray(0, 16));
    var key = k.subarray(0, 16);
    // U (algorithme 5)
    var U = rc4(key, md5(concat(PAD, id)));
    for (i = 1; i <= 19; i++) U = rc4(xorKey(key, i), U);
    U = concat(U, new Uint8Array(16));

    function objKey(num, gen) {
        var ext = new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
        return md5(concat(key, ext)).subarray(0, 16);
    }
    function toHex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
    function encStr(obj, ok) {
        var bytes = obj.asBytes ? obj.asBytes() : null;
        if (!bytes) return obj;
        return PDFLib.PDFHexString.of(toHex(rc4(ok, bytes)));
    }
    function isStr(o) { return o instanceof PDFLib.PDFString || o instanceof PDFLib.PDFHexString; }
    function walk(o, ok) {
        if (o instanceof PDFLib.PDFDict) {
            o.entries().forEach(function (e) { if (isStr(e[1])) o.set(e[0], encStr(e[1], ok)); else walk(e[1], ok); });
        } else if (o instanceof PDFLib.PDFArray) {
            for (var i = 0; i < o.size(); i++) { var v = o.get(i); if (isStr(v)) o.set(i, encStr(v, ok)); else walk(v, ok); }
        }
    }
    // Dictionnaire de chiffrement : objet indirect, jamais chiffré lui-même
    var enc = ctx.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: PERM });
    enc.set(N.of('O'), PDFLib.PDFHexString.of(toHex(O)));
    enc.set(N.of('U'), PDFLib.PDFHexString.of(toHex(U)));
    var encRef = ctx.register(enc);

    ctx.enumerateIndirectObjects().forEach(function (pair) {
        var ref = pair[0], obj = pair[1];
        if (ref === encRef) return;
        var ok = objKey(ref.objectNumber, ref.generationNumber);
        if (obj instanceof PDFLib.PDFStream) {
            var raw = obj.getContents();
            walk(obj.dict, ok);
            var dict = obj.dict;
            ctx.assign(ref, PDFLib.PDFRawStream.of(dict, rc4(ok, raw)));
        } else {
            if (isStr(obj)) ctx.assign(ref, encStr(obj, ok)); else walk(obj, ok);
        }
    });
    ctx.trailerInfo.Encrypt = encRef;
    ctx.trailerInfo.ID = ctx.obj([PDFLib.PDFHexString.of(toHex(id)), PDFLib.PDFHexString.of(toHex(id))]);
    return pdf;
}
exports.apply = apply; exports.md5 = md5; exports.rc4 = rc4;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.AvecProtect = {}));
