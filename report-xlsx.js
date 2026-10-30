/* WEBSERVICES FIN : écriture d'un classeur Excel (.xlsx) avec feuilles mises en forme et graphiques.
 * Aucun serveur : le fichier est construit dans le navigateur (JSZip, voir vendor/jszip.min.js).
 * Utilisation : const b = new AvecXlsx(JSZip); const s = b.sheet('Nom', {...}); s.set(...); b.blob().then(...) */
(function (root) {
    'use strict';
    var NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    var NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
    var NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
    var PALETTE = ['2563EB', '10B981', 'F59E0B', 'EF4444', '8B5CF6', '06B6D4', 'EC4899', '84CC16', '64748B', 'F97316'];

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    function ref(r, c) { return colName(c) + r; }
    function absRange(sheet, c1, r1, c2, r2) { return "'" + sheet.replace(/'/g, "''") + "'!$" + colName(c1) + '$' + r1 + ':$' + colName(c2) + '$' + r2; }
    // Date ISO (aaaa-mm-jj) -> numéro de série Excel
    function serial(iso) {
        var p = String(iso || '').slice(0, 10).split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
        return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000) + 25569;
    }

    function Styles() {
        this.fonts = ['<font><sz val="10"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>'];
        this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
        this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
        this.numFmts = [];
        this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
        this.cache = {};
    }
    Styles.prototype.idx = function (list, xml) { var i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; };
    var BUILTIN = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4 };
    Styles.prototype.get = function (o) {
        if (!o) return 0;
        var key = JSON.stringify(o);
        if (this.cache[key] !== undefined) return this.cache[key];
        var f = '<font>' + (o.b ? '<b/>' : '') + (o.i ? '<i/>' : '') + '<sz val="' + (o.sz || 10) + '"/><color rgb="FF' + (o.color || '1F2937') + '"/><name val="Calibri"/><family val="2"/></font>';
        var fontId = this.idx(this.fonts, f);
        var fillId = 0;
        if (o.bg) fillId = this.idx(this.fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.bg + '"/><bgColor indexed="64"/></patternFill></fill>');
        var bc = 'FF' + (o.bc || 'D9E1EC'), side = function (n) { return '<' + n + ' style="thin"><color rgb="' + bc + '"/></' + n + '>'; };
        var bx = '<border><left/><right/><top/><bottom/><diagonal/></border>';
        if (o.border === 'all') bx = '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>';
        else if (o.border === 'bottom') bx = '<border><left/><right/><top/>' + side('bottom') + '<diagonal/></border>';
        else if (o.border === 'top') bx = '<border><left/><right/>' + side('top') + '<bottom/><diagonal/></border>';
        var borderId = this.idx(this.borders, bx);
        var numId = 0;
        if (o.fmt) {
            if (BUILTIN[o.fmt] !== undefined) numId = BUILTIN[o.fmt];
            else {
                var k = this.numFmts.indexOf(o.fmt);
                if (k < 0) { this.numFmts.push(o.fmt); k = this.numFmts.length - 1; }
                numId = 164 + k;
            }
        }
        var al = '<alignment' + (o.al ? ' horizontal="' + (o.al === 'c' ? 'center' : o.al === 'r' ? 'right' : 'left') + '"' : '') + ' vertical="' + (o.va || 'center') + '"' + (o.wrap ? ' wrapText="1"' : '') + (o.indent ? ' indent="' + o.indent + '"' : '') + '/>';
        var xf = '<xf numFmtId="' + numId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">' + al + '</xf>';
        this.xfs.push(xf);
        this.cache[key] = this.xfs.length - 1;
        return this.cache[key];
    };
    Styles.prototype.xml = function () {
        var nf = this.numFmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(f) + '"/>'; }).join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + NS_MAIN + '">' +
            (nf ? '<numFmts count="' + this.numFmts.length + '">' + nf + '</numFmts>' : '') +
            '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
            '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
            '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    };

    // ---------- Feuille ----------
    function Sheet(book, name, opts) {
        this.book = book; this.name = name; this.opts = opts || {};
        this.cells = {}; this.merges = []; this.heights = {}; this.widths = this.opts.widths || [];
        this.charts = []; this.images = []; this.filter = null; this.maxR = 1; this.maxC = 1;
    }
    // set(ligne, colonne, valeur, style) ; valeur = texte, nombre, ou { f: 'SUM(A1:A3)', v: 6 } pour une formule
    Sheet.prototype.set = function (r, c, v, st) {
        this.cells[r + ',' + c] = { v: v, s: this.book.styles.get(st) };
        if (r > this.maxR) this.maxR = r; if (c > this.maxC) this.maxC = c;
    };
    Sheet.prototype.style = function (r, c, st) { // style seul (cellules fusionnées, fond)
        if (!this.cells[r + ',' + c]) this.set(r, c, null, st);
    };
    Sheet.prototype.merge = function (r1, c1, r2, c2, st) {
        this.merges.push(ref(r1, c1) + ':' + ref(r2, c2));
        for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) if (!this.cells[r + ',' + c]) this.set(r, c, null, st);
    };
    Sheet.prototype.height = function (r, h) { this.heights[r] = h; };
    Sheet.prototype.autofilter = function (r1, c1, r2, c2) { this.filter = ref(r1, c1) + ':' + ref(r2, c2); };
    // Commentaires sous un tableau : titre + une ligne fusionnée par remarque (fond jaune clair, texte à la ligne)
    Sheet.prototype.notes = function (r, n, lines, title) {
        if (!lines || !lines.length) return r;
        var tw = 0, i;
        for (i = 0; i < n; i++) tw += (this.widths[i] || 14);
        var hs = { b: true, color: '92400E', bg: 'FEF3C7', border: 'all', bc: 'FCD34D', indent: 1 };
        this.merge(r, 1, r, n, hs); this.set(r, 1, title || 'Commentaires', hs); this.height(r, 22);
        var ls = { color: '374151', bg: 'FFFBEB', border: 'all', bc: 'FCD34D', wrap: true, indent: 1, va: 't' };
        for (i = 0; i < lines.length; i++) {
            var txt = '\u2022 ' + lines[i], rr = r + 1 + i;
            this.merge(rr, 1, rr, n, ls); this.set(rr, 1, txt, ls);
            this.height(rr, Math.max(20, Math.ceil(txt.length / Math.max(20, tw * 1.05)) * 15 + 6));
        }
        return r + lines.length + 1;
    };
    // Graphique natif Excel : { type:'col'|'bar'|'doughnut', title, name, cats:[..], vals:[..], catRef, valRef, from:[col,ligne], to:[col,ligne], fmt, colors }
    Sheet.prototype.chart = function (c) { this.charts.push(c); };
    // Image JPEG/PNG en base64 : { data, ext:'jpeg'|'png', col, row, w, h (pixels) }
    Sheet.prototype.image = function (im) { this.images.push(im); };

    Sheet.prototype.xml = function (drawingRid) {
        var rows = {}, key;
        for (key in this.cells) { var p = key.split(','); (rows[p[0]] = rows[p[0]] || []).push(Number(p[1])); }
        var rowNums = Object.keys(rows).map(Number); Object.keys(this.heights).forEach(function (h) { if (rowNums.indexOf(Number(h)) < 0) rowNums.push(Number(h)); });
        rowNums.sort(function (a, b) { return a - b; });
        var data = '', self = this;
        rowNums.forEach(function (r) {
            var cols = (rows[r] || []).sort(function (a, b) { return a - b; });
            data += '<row r="' + r + '"' + (self.heights[r] ? ' ht="' + self.heights[r] + '" customHeight="1"' : '') + '>';
            cols.forEach(function (c) {
                var cell = self.cells[r + ',' + c], v = cell.v, a = ref(r, c), s = cell.s ? ' s="' + cell.s + '"' : '';
                if (v === null || v === undefined || v === '') data += '<c r="' + a + '"' + s + '/>';
                else if (typeof v === 'number' && isFinite(v)) data += '<c r="' + a + '"' + s + '><v>' + v + '</v></c>';
                else if (typeof v === 'object' && v.f) data += '<c r="' + a + '"' + s + '><f>' + esc(v.f) + '</f>' + (v.v !== undefined ? '<v>' + v.v + '</v>' : '') + '</c>';
                else data += '<c r="' + a + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
            });
            data += '</row>';
        });
        var o = this.opts;
        var cols = this.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('');
        var pane = '';
        if (o.freeze) pane = '<pane ' + (o.freeze.col ? 'xSplit="' + o.freeze.col + '" ' : '') + (o.freeze.row ? 'ySplit="' + o.freeze.row + '" ' : '') +
            'topLeftCell="' + ref((o.freeze.row || 0) + 1, (o.freeze.col || 0) + 1) + '" activePane="' + (o.freeze.col && o.freeze.row ? 'bottomRight' : (o.freeze.row ? 'bottomLeft' : 'topRight')) + '" state="frozen"/>';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">' +
            '<sheetPr>' + (o.tab ? '<tabColor rgb="FF' + o.tab + '"/>' : '') + '<pageSetUpPr fitToPage="1"/></sheetPr>' +
            '<dimension ref="A1:' + ref(this.maxR, this.maxC) + '"/>' +
            '<sheetViews><sheetView workbookViewId="0"' + (o.grid === false ? ' showGridLines="0"' : '') + (o.first ? ' tabSelected="1"' : '') + (o.zoom ? ' zoomScale="' + o.zoom + '"' : '') + '>' + pane + '</sheetView></sheetViews>' +
            '<sheetFormatPr defaultRowHeight="16"/>' + (cols ? '<cols>' + cols + '</cols>' : '') +
            '<sheetData>' + data + '</sheetData>' +
            (this.book.protectPwd != null ? '<sheetProtection sheet="1" objects="1" scenarios="1" sort="0" autoFilter="0"' + (this.book.protectPwd ? ' password="' + xlsHash(this.book.protectPwd) + '"' : '') + '/>' : '') +
            (this.filter ? '<autoFilter ref="' + this.filter + '"/>' : '') +
            (this.merges.length ? '<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
            '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
            '<pageSetup paperSize="9" orientation="' + (o.landscape === false ? 'portrait' : 'landscape') + '" fitToWidth="1" fitToHeight="0"/>' +
            '<headerFooter><oddFooter>&amp;L' + esc(typeof orgName==='function'?orgName():'WEBSERVICES FIN') + '&amp;CPage &amp;P / &amp;N&amp;R&amp;D</oddFooter></headerFooter>' +
            (drawingRid ? '<drawing r:id="' + drawingRid + '"/>' : '') + '</worksheet>';
    };

    // ---------- Graphiques ----------
    function txPr(sz, color, bold) {
        return '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '" b="' + (bold ? 1 : 0) + '"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>';
    }
    function strCache(a) { return '<c:strCache><c:ptCount val="' + a.length + '"/>' + a.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + esc(v) + '</c:v></c:pt>'; }).join('') + '</c:strCache>'; }
    function numCache(a, fmt) { return '<c:numCache><c:formatCode>' + esc(fmt || 'General') + '</c:formatCode><c:ptCount val="' + a.length + '"/>' + a.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + (Number(v) || 0) + '</c:v></c:pt>'; }).join('') + '</c:numCache>'; }
    function chartXml(ch) {
        var colors = ch.colors || PALETTE, dl;
        var title = '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1"><a:solidFill><a:srgbClr val="1E3A8A"/></a:solidFill></a:rPr><a:t>' + esc(ch.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>';
        var cat = '<c:cat><c:strRef><c:f>' + esc(ch.catRef) + '</c:f>' + strCache(ch.cats) + '</c:strRef></c:cat>';
        var val = '<c:val><c:numRef><c:f>' + esc(ch.valRef) + '</c:f>' + numCache(ch.vals, ch.fmt) + '</c:numRef></c:val>';
        var tx = '<c:tx><c:v>' + esc(ch.name || ch.title) + '</c:v></c:tx>';
        var plot, legend = '';
        dl = '<c:dLbls>' + (ch.fmt ? '<c:numFmt formatCode="' + esc(ch.fmt) + '" sourceLinked="0"/>' : '') + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(900, '374151', true) +
            (ch.type === 'doughnut' ? '' : '<c:dLblPos val="outEnd"/>') + '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
        if (ch.type === 'doughnut') {
            var dpts = ch.vals.map(function (_, i) { return '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="' + colors[i % colors.length] + '"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>'; }).join('');
            dl = dl.replace('<c:showVal val="1"/>', '<c:showVal val="1"/>');
            plot = '<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>' + tx + dpts + dl + cat + val + '</c:ser><c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>';
            legend = '<c:legend><c:legendPos val="r"/><c:overlay val="0"/>' + txPr(1000, '374151', false) + '</c:legend>';
        } else {
            var horiz = ch.type === 'bar';
            var ser = '<c:ser><c:idx val="0"/><c:order val="0"/>' + tx + '<c:spPr><a:solidFill><a:srgbClr val="' + colors[0] + '"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>' + dl + cat + val + '</c:ser>';
            plot = '<c:barChart><c:barDir val="' + (horiz ? 'bar' : 'col') + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + ser + '<c:gapWidth val="55"/><c:axId val="50010"/><c:axId val="50020"/></c:barChart>' +
                '<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="' + (horiz ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="0"/><c:axPos val="' + (horiz ? 'l' : 'b') + '"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>' + txPr(900, '374151', false) + '<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
                '<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="' + (horiz ? 1 : 0) + '"/><c:axPos val="' + (horiz ? 't' : 'l') + '"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="' + esc(ch.fmt || 'General') + '" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(900, '6B7280', false) + '<c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/>' +
            '<c:chart>' + title + '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' + plot + '</c:plotArea>' + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
            '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9E1EC"/></a:solidFill></a:ln></c:spPr></c:chartSpace>';
    }
    function anchorXml(c, r, dc, dr) { return '<xdr:col>' + c + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + r + '</xdr:row><xdr:rowOff>0</xdr:rowOff>'; }

    // ---------- Classeur ----------
    // Empreinte « ancienne » d'un mot de passe de feuille/classeur (format Excel standard)
    function xlsHash(pw) {
        var h = 0, i;
        for (i = pw.length - 1; i >= 0; i--) { h = ((h >> 14) & 1) | ((h << 1) & 0x7fff); h ^= pw.charCodeAt(i); }
        h = ((h >> 14) & 1) | ((h << 1) & 0x7fff); h ^= pw.length; h ^= 0xCE4B;
        return h.toString(16).toUpperCase();
    }
    function Book(JSZip) { this.JSZip = JSZip; this.sheets = []; this.styles = new Styles(); this.props = {}; }
    Book.prototype.sheet = function (name, opts) {
        var clean = String(name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
        var s = new Sheet(this, clean, opts); this.sheets.push(s); return s;
    };
    Book.prototype.zip = function () {
        var z = new this.JSZip(), self = this, chartN = 0, imgN = 0, drawN = 0;
        var types = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
            '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
        var wbSheets = '', wbRels = '';
        this.sheets.forEach(function (sh, i) {
            var n = i + 1, drid = null;
            if (sh.charts.length || sh.images.length) {
                drawN++; drid = 'rId1';
                var dxml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="' + NS_XDR + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:c="' + NS_C + '">', drels = '', rid = 0, shapeId = 1;
                sh.charts.forEach(function (ch) {
                    chartN++; rid++; shapeId++;
                    z.file('xl/charts/chart' + chartN + '.xml', chartXml(ch));
                    types += '<Override PartName="/xl/charts/chart' + chartN + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
                    drels += '<Relationship Id="rId' + rid + '" Type="' + NS_R + '/chart" Target="../charts/chart' + chartN + '.xml"/>';
                    dxml += '<xdr:twoCellAnchor><xdr:from>' + anchorXml(ch.from[0], ch.from[1]) + '</xdr:from><xdr:to>' + anchorXml(ch.to[0], ch.to[1]) + '</xdr:to>' +
                        '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + shapeId + '" name="Graphique ' + chartN + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart r:id="rId' + rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
                });
                sh.images.forEach(function (im) {
                    imgN++; rid++; shapeId++;
                    var ext = im.ext === 'png' ? 'png' : 'jpeg';
                    z.file('xl/media/image' + imgN + '.' + ext, im.data, { base64: true });
                    drels += '<Relationship Id="rId' + rid + '" Type="' + NS_R + '/image" Target="../media/image' + imgN + '.' + ext + '"/>';
                    dxml += '<xdr:oneCellAnchor><xdr:from>' + anchorXml(im.col, im.row) + '</xdr:from><xdr:ext cx="' + Math.round(im.w * 9525) + '" cy="' + Math.round(im.h * 9525) + '"/>' +
                        '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + shapeId + '" name="Photo ' + imgN + '" descr="' + esc(im.alt || '') + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId' + rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + Math.round(im.w * 9525) + '" cy="' + Math.round(im.h * 9525) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
                });
                dxml += '</xdr:wsDr>';
                z.file('xl/drawings/drawing' + drawN + '.xml', dxml);
                z.file('xl/drawings/_rels/drawing' + drawN + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drels + '</Relationships>');
                z.file('xl/worksheets/_rels/sheet' + n + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + NS_R + '/drawing" Target="../drawings/drawing' + drawN + '.xml"/></Relationships>');
                types += '<Override PartName="/xl/drawings/drawing' + drawN + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
            }
            z.file('xl/worksheets/sheet' + n + '.xml', sh.xml(drid));
            types += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            wbSheets += '<sheet name="' + esc(sh.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
            wbRels += '<Relationship Id="rId' + n + '" Type="' + NS_R + '/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
        });
        wbRels += '<Relationship Id="rId' + (this.sheets.length + 1) + '" Type="' + NS_R + '/styles" Target="styles.xml"/>';
        z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + types + '</Types>');
        z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
        z.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(this.props.title || 'Rapport') + '</dc:title><dc:creator>' + esc(this.props.creator || (typeof orgName==='function'?orgName():'WEBSERVICES FIN')) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created></cp:coreProperties>');
        z.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">' + (this.protectPwd != null ? '<workbookProtection lockStructure="1"' + (this.protectPwd ? ' workbookPassword="' + xlsHash(this.protectPwd) + '"' : '') + '/>' : '') + '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' + wbSheets + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
        z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>');
        z.file('xl/styles.xml', this.styles.xml());
        return z;
    };
    Book.prototype.blob = function () {
        return this.zip().generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    };
    Book.prototype.buffer = function () { return this.zip().generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); };


    // ---------- Feuille « tableau » prête à l'emploi : bandeau, sous-titre, en-têtes, lignes zébrées, statuts colorés ----------
    var FMT = { usd: '"$"#,##0.00', fc: '#,##0" FC"', int: '#,##0', date: 'dd/mm/yyyy', dt: 'dd/mm/yyyy hh:mm' };
    function statusColors(t) {
        var x = String(t || '').toLowerCase();
        if (!x || x === '-' || x === '—') return null;
        if (/retard|refus|pas d'acc|^non$|échec|echec|vide/.test(x)) return { bg: 'FEE2E2', color: '991B1B' };
        if (/rembours|approuv|trait|^actif|à jour|avance|accept|^oui$|complet|envoy/.test(x)) return { bg: 'D1FAE5', color: '065F46' };
        if (/cours|attente|ouverte|début|partiel/.test(x)) return { bg: 'FEF3C7', color: '92400E' };
        return null;
    }
    // o : { title, subtitle, tab, first, cols:[{h, w, k}], rows:[[...]], totals:{ label, cols:[indices à additionner] }, empty }
    // k : text | center | usd | fc | int | date | dt | status | wrap ; une cellule peut aussi être { v, k } pour changer son type
    Book.prototype.table = function (name, o) {
        var self = this, n = o.cols.length;
        var sh = this.sheet(name, { tab: o.tab, first: o.first, grid: false, freeze: { row: 4 }, widths: o.cols.map(function (c) { return c.w || 14; }), landscape: o.landscape });
        sh.merge(1, 1, 1, n, { b: true, sz: 16, color: 'FFFFFF', bg: '1E3A8A', indent: 1 }); sh.set(1, 1, o.title, { b: true, sz: 16, color: 'FFFFFF', bg: '1E3A8A', indent: 1 }); sh.height(1, 34);
        sh.merge(2, 1, 2, n, { i: true, color: '6B7280', indent: 1 }); sh.set(2, 1, o.subtitle || '', { i: true, color: '6B7280', indent: 1 }); sh.height(2, 20); sh.height(3, 6);
        o.cols.forEach(function (c, i) { sh.set(4, i + 1, c.h, { b: true, color: 'FFFFFF', bg: '2563EB', al: 'c', wrap: true, border: 'all', bc: '1D4ED8' }); });
        sh.height(4, 30);
        var rows = o.rows || [], r0 = 5;
        function cellStyle(kind, band, val) {
            var st = { bg: band ? 'F4F7FB' : 'FFFFFF', border: 'all' };
            if (kind === 'usd' || kind === 'fc' || kind === 'int') { st.fmt = FMT[kind]; st.al = 'r'; }
            else if (kind === 'date' || kind === 'dt') { st.fmt = FMT[kind]; st.al = 'c'; }
            else if (kind === 'center') st.al = 'c';
            else if (kind === 'wrap') { st.wrap = true; }
            else if (kind === 'status') { st.al = 'c'; st.b = true; var c = statusColors(val); if (c) { st.bg = c.bg; st.color = c.color; } }
            return st;
        }
        rows.forEach(function (row, i) {
            row.forEach(function (cell, j) {
                var kind = o.cols[j].k || 'text', v = cell;
                if (cell && typeof cell === 'object' && !cell.f) { v = cell.v; kind = cell.k || kind; }
                if ((kind === 'date' || kind === 'dt') && typeof v === 'string') v = serial(v);
                if (kind === 'dt' && typeof v === 'number') { /* date seule */ }
                sh.set(r0 + i, j + 1, v, cellStyle(kind, i % 2 === 1, v));
            });
            if (o.fixedHeight || o.cols.some(function (c) { return c.k === 'wrap'; })) sh.height(r0 + i, o.rowHeight || 32);
        });
        var last = r0 + rows.length - 1;
        if (!rows.length) {
            sh.merge(r0, 1, r0, n, { i: true, color: '6B7280', al: 'c', border: 'all' }); sh.set(r0, 1, o.empty || 'Aucune donnée pour le moment.', { i: true, color: '6B7280', al: 'c', border: 'all' });
            last = r0;
        } else {
            sh.autofilter(4, 1, last, n);
            if (o.totals) {
                var tr = last + 1, base = { b: true, bg: 'E0E7FF', color: '1E3A8A', border: 'all', bc: '93A5E8' };
                for (var c = 1; c <= n; c++) sh.set(tr, c, null, base);
                sh.set(tr, 1, o.totals.label || 'Total', base);
                o.totals.cols.forEach(function (ci) {
                    var kind = o.cols[ci].k || 'int', sum = 0;
                    rows.forEach(function (row) { var cell = row[ci]; var v = cell && typeof cell === 'object' && !cell.f ? cell.v : cell; sum += Number(v) || 0; });
                    var rng = colName(ci + 1) + r0 + ':' + colName(ci + 1) + last;
                    sh.set(tr, ci + 1, { f: 'SUBTOTAL(109,' + rng + ')', v: Math.round(sum * 100) / 100 }, { b: true, bg: 'E0E7FF', color: '1E3A8A', border: 'all', bc: '93A5E8', fmt: FMT[kind], al: 'r' });
                });
                sh.height(tr, 22);
            }
        }
        if (o.notes && o.notes.length) sh.notes(last + ((o.totals && rows.length) ? 3 : 2), n, o.notes);
        sh.table = { r0: r0, last: last, n: n, rangeOf: function (ci) { return absRange(sh.name, ci + 1, r0, ci + 1, last); } };
        return sh;
    };
    // Petit bloc de données (pour alimenter un graphique) à une position donnée ; renvoie les références
    Sheet.prototype.block = function (r, c, title, headers, rows, kinds) {
        var self = this, hs = { b: true, color: 'FFFFFF', bg: '64748B', al: 'c', border: 'all', bc: '475569' };
        this.set(r, c, title, { b: true, color: '1E3A8A', sz: 11 });
        headers.forEach(function (h, j) { self.set(r + 1, c + j, h, hs); });
        rows.forEach(function (row, i) {
            row.forEach(function (v, j) {
                var k = (kinds || [])[j], st = { bg: i % 2 ? 'F4F7FB' : 'FFFFFF', border: 'all' };
                if (k && FMT[k]) { st.fmt = FMT[k]; st.al = 'r'; }
                self.set(r + 2 + i, c + j, v, st);
            });
        });
        var a = r + 2, b = r + 1 + rows.length;
        return { cats: rows.map(function (x) { return x[0]; }), vals: rows.map(function (x) { return x[1]; }), catRef: absRange(this.name, c, a, c, b), valRef: absRange(this.name, c + 1, a, c + 1, b), next: b + 2 };
    };
    Book.FMT = FMT;
    root.AvecXlsx = Book;
    root.AvecXlsx.util = { serial: serial, colName: colName, absRange: absRange, PALETTE: PALETTE };
    if (typeof module !== 'undefined' && module.exports) module.exports = Book;
})(typeof window !== 'undefined' ? window : globalThis);
