/*
 * utaformatix3-ts-plus mikuscore bundle (IIFE)
 * Global: UtaFormatix3TsPlusMikuscore
 * Optional hooks:
 *   globalThis.__utaformatix3TsPlusMikuscoreHooks = { normalizeImportedMusicXmlText(xml) }
 */
var UtaFormatix3TsPlusMikuscore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    MikuscoreMusicXmlAdapter: () => MikuscoreMusicXmlAdapter,
    convertMusicXmlToVsqx: () => convertMusicXmlToVsqx,
    convertVsqxToMusicXml: () => convertVsqxToMusicXml,
    convertVsqxToMusicXmlWithReport: () => convertVsqxToMusicXmlWithReport,
    getMusicXmlAdapter: () => getMusicXmlAdapter,
    setMusicXmlAdapter: () => setMusicXmlAdapter
  });

  // upstream/utaformatix3-ts/dist-lib/utaformatix3-ts.esm.js
  var j = /* @__PURE__ */ ((t) => (t.Vsqx = "Vsqx", t.MusicXml = "MusicXml", t.UfData = "UfData", t.Ust = "Ust", t.Ustx = "Ustx", t.Ccs = "Ccs", t.Svp = "Svp", t))(j || {});
  var S = /* @__PURE__ */ ((t) => (t.Unknown = "Unknown", t.RomajiCv = "RomajiCv", t.RomajiVcv = "RomajiVcv", t.KanaCv = "KanaCv", t.KanaVcv = "KanaVcv", t))(S || {});
  function se(t) {
    return t.tickOff - t.tickOn;
  }
  function Ct(t) {
    if (t.length === 0)
      return t;
    const e = [...t].sort((r, i) => r.tickOn - i.tickOn), n = [];
    for (let r = 0; r < e.length - 1; r += 1) {
      const i = e[r], o = e[r + 1], s = {
        ...i,
        tickOff: Math.min(i.tickOff, o.tickOn)
      };
      se(s) > 0 && n.push(s);
    }
    return n.push(e[e.length - 1]), n.map((r, i) => ({
      ...r,
      id: i
    }));
  }
  function pt(t) {
    return {
      ...t,
      notes: Ct(t.notes)
    };
  }
  function he(t) {
    return t.tickOff - t.tickOn;
  }
  var ht = 480;
  var de = ht * 4;
  var ge = 4;
  var Te = 4;
  var dt = class {
    constructor(e = 1, n = de) {
      this._tick = 0, this._measure = 0, this._numerator = ge, this._denominator = Te, this.tickRate = e, this.ticksInFullNote = n;
    }
    get tick() {
      return this._tick;
    }
    get outputTick() {
      return Math.trunc(this._tick * this.tickRate);
    }
    get measure() {
      return this._measure;
    }
    get numerator() {
      return this._numerator;
    }
    get denominator() {
      return this._denominator;
    }
    get ticksInMeasure() {
      return this.ticksInFullNote * this._numerator / this._denominator;
    }
    goToTick(e, n, r) {
      const i = e / this.tickRate, s = (i - this._tick) / this.ticksInMeasure;
      this._measure += Math.trunc(s), this._tick = Math.trunc(i), this._numerator = n ?? this._numerator, this._denominator = r ?? this._denominator;
    }
    goToTimeSignatureMeasure(e) {
      this.goToMeasure(
        e.measurePosition,
        e.numerator,
        e.denominator
      );
    }
    goToMeasure(e, n, r) {
      const o = (e - this._measure) * this.ticksInMeasure;
      this._tick += o, this._measure = e, n != null && (this._numerator = n), r != null && (this._denominator = r);
    }
  };
  var tt = 8191;
  var et = 2;
  var Nt = 480;
  var Pe = 5;
  function ye(t) {
    const e = [];
    let n = -1;
    for (const r of t) {
      if (n < 0) {
        n = r.tickOff;
        continue;
      }
      if (n === r.tickOn)
        e.push(n);
      else if (n < r.tickOn)
        e.push(Math.trunc((r.tickOn + n) / 2));
      else
        throw new Error("Notes overlapping");
      n = r.tickOff;
    }
    return e;
  }
  function be(t, e, n) {
    if (n <= 0)
      return t;
    const r = [...t];
    for (let i = 0; i < e.length - 1; i += 1) {
      const o = e[i], s = e[i + 1];
      if (s.tickOn - o.tickOff > n)
        continue;
      const c = r.findIndex((f) => f[0] >= s.tickOn);
      if (c < 0)
        continue;
      const a = r[c];
      if (a[0] === s.tickOn || a[0] - s.tickOn > n)
        continue;
      const u = a[1];
      if (u == null)
        continue;
      const l = s.tickOn - n, m = [l, u];
      r.splice(c, 0, m);
      for (let f = r.length - 1; f >= 0; f -= 1) {
        const p = r[f];
        p !== m && p[0] >= l && p[0] < s.tickOn && r.splice(f, 1);
      }
    }
    return r;
  }
  function Se(t, e, n = 0) {
    if (!t.isAbsolute)
      return t.data.map(([u, l]) => [u, l]).filter((u) => u[1] != null).map(([u, l]) => [u, l]);
    if (e.length === 0)
      return null;
    const r = ye(e);
    let i = 0, o = e[0].key, s = r[0] ?? Number.POSITIVE_INFINITY;
    const c = t.data.map(([u, l]) => {
      for (; u >= s; )
        i += 1, s = r[i] ?? Number.POSITIVE_INFINITY, o = e[i].key;
      const m = l != null ? l - o : 0;
      return [u, m];
    });
    return be(c, e, n).filter((u) => u[1] != null).map(([u, l]) => [u, l]);
  }
  function Ut(t) {
    const r = t.map((i) => {
      const o = i.pit, s = i.pbs, c = /* @__PURE__ */ new Map();
      let a = 0, u = et;
      for (const l of s) {
        for (let m = a; m <= o.length - 1; m += 1) {
          const f = o[m];
          if (f.pos < l.pos)
            c.set(f.pos, f.value * u), m === o.length - 1 && (a = m);
          else {
            a = m;
            break;
          }
        }
        u = l.value;
      }
      if (a < o.length - 1)
        for (let l = a; l <= o.length - 1; l += 1) {
          const m = o[l];
          c.set(m.pos, m.value * u);
        }
      return Array.from(c.entries()).map(
        ([l, m]) => [l + i.startPos, m]
      );
    }).reduce((i, o) => {
      const s = o[0]?.[0];
      if (s == null)
        return i;
      const c = i.findIndex((a) => a[0] >= s);
      return c < 0 ? i.concat(o) : i.slice(0, c).concat(o);
    }, []).map(([i, o]) => [i, o / tt]);
    return r.length === 0 ? null : {
      data: r,
      isAbsolute: false
    };
  }
  function Ne(t, e) {
    const n = Se(t, e, Pe);
    if (!n)
      return null;
    const r = [];
    let i = 0;
    for (const c of n)
      r.length === 0 ? r.push([c]) : c[0] - i >= Nt ? r.push([c]) : r[r.length - 1].push(c), i = c[0];
    const o = [], s = [];
    for (const c of r) {
      const a = c.reduce((l, m) => Math.max(l, Math.abs(m[1])), 0);
      let u = Math.ceil(Math.abs(a));
      u > et ? (s.push({ pos: c[0][0], value: u }), s.push({
        pos: c[c.length - 1][0] + Nt / 2,
        value: et
      })) : u = et;
      for (const [l, m] of c)
        o.push({
          pos: l,
          value: Math.max(
            -tt,
            Math.min(tt, Math.round(m * tt / u))
          )
        });
    }
    return {
      startPos: 0,
      pit: o,
      pbs: s
    };
  }
  var kt = 100;
  var xe = 1;
  var Oe = {
    masterTrack: "masterTrack",
    preMeasure: "preMeasure",
    timeSig: "timeSig",
    posMes: "m",
    nume: "nu",
    denomi: "de",
    tempo: "tempo",
    posTick: "t",
    bpm: "v",
    vsTrack: "vsTrack",
    trackName: "name",
    musicalPart: "vsPart",
    note: "note",
    duration: "dur",
    noteNum: "n",
    lyric: "y",
    xSampa: "p",
    trackNum: "tNo",
    playTime: "playTime",
    mCtrl: "cc",
    attr: "v",
    id: "id",
    pbsName: "S",
    pitName: "P"
  };
  var ve = {
    masterTrack: "masterTrack",
    preMeasure: "preMeasure",
    timeSig: "timeSig",
    posMes: "posMes",
    nume: "nume",
    denomi: "denomi",
    tempo: "tempo",
    posTick: "posTick",
    bpm: "bpm",
    vsTrack: "vsTrack",
    trackName: "trackName",
    musicalPart: "musicalPart",
    note: "note",
    duration: "durTick",
    noteNum: "noteNum",
    lyric: "lyric",
    xSampa: "phnms",
    trackNum: "vsTrackNo",
    playTime: "playTime",
    mCtrl: "mCtrl",
    attr: "attr",
    id: "id",
    pbsName: "PBS",
    pitName: "PIT"
  };
  function jt(t) {
    return t.includes('xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq4/"') ? "vsq4" : "vsq3";
  }
  function Xt(t) {
    return t === "vsq4" ? Oe : ve;
  }
  function nt(t) {
    return t.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }
  function $(t, e) {
    const n = t.getElementsByTagName(e).item(0);
    return n instanceof Element ? n : null;
  }
  function A(t, e) {
    return $(t, e)?.textContent?.trim() ?? null;
  }
  function Kt(t, e) {
    const n = new dt();
    for (const r of t) {
      if (r.measurePosition >= e) break;
      n.goToTimeSignatureMeasure(r);
    }
    return n.goToMeasure(e), n.tick;
  }
  function Ae(t, e, n, r) {
    const i = Array.from(t.getElementsByTagName(e.timeSig)).map((l) => {
      const m = Number(A(l, e.posMes)), f = Number(A(l, e.nume)), p = Number(A(l, e.denomi));
      return !Number.isFinite(m) || !Number.isFinite(f) || !Number.isFinite(p) ? null : { measurePosition: m, numerator: f, denominator: p };
    }).filter((l) => l !== null), o = i.length > 0 ? i : [{ measurePosition: 0, numerator: 4, denominator: 4 }];
    i.length === 0 && r.push({ kind: "TimeSignatureNotFound" });
    const s = Kt(o, n), c = o.map((l) => ({
      ...l,
      measurePosition: l.measurePosition - n
    })), a = c.reduce((l, m, f) => m.measurePosition <= 0 ? f : l, 0), u = c.slice(a);
    return u.length > 0 && (u[0] = { ...u[0], measurePosition: 0 }), { tickPrefix: s, timeSignatures: u };
  }
  function Ie(t, e, n, r) {
    const i = Array.from(t.getElementsByTagName(e.tempo)).map((a) => {
      const u = Number(A(a, e.posTick)), l = Number(A(a, e.bpm));
      return !Number.isFinite(u) || !Number.isFinite(l) ? null : { tickPosition: u - n, bpm: l / kt };
    }).filter((a) => a !== null), o = i.length > 0 ? i : [{ tickPosition: 0, bpm: 120 }];
    i.length === 0 && r.push({ kind: "TempoNotFound" });
    const s = o.reduce((a, u, l) => u.tickPosition <= 0 ? l : a, 0), c = o.slice(s);
    return c.length > 0 && (c[0] = { ...c[0], tickPosition: 0 }), c;
  }
  function Me(t, e, n, r, i) {
    const o = A(t, n.trackName) ?? `Track ${e + 1}`, s = Array.from(t.getElementsByTagName(n.musicalPart)), c = s.flatMap((u) => {
      const l = Number(A(u, n.posTick) ?? "0") - r;
      return Array.from(u.getElementsByTagName(n.note)).map((f) => ({ tickOffset: l, noteNode: f }));
    }).map(({ tickOffset: u, noteNode: l }, m) => {
      const f = Number(A(l, n.noteNum) ?? "0"), p = Number(A(l, n.posTick) ?? "0"), h = Number(A(l, n.duration) ?? "0"), d = A(l, n.lyric) ?? i.defaultLyric ?? "\u3042", P = A(l, n.xSampa);
      return {
        id: m,
        key: f,
        lyric: d,
        tickOn: p + u,
        tickOff: p + u + h,
        phoneme: P ?? void 0
      };
    });
    let a = null;
    if (!i.simpleImport) {
      const u = s.map((l) => {
        const m = Number(A(l, n.posTick) ?? "0") - r, f = Array.from(l.getElementsByTagName(n.mCtrl)), p = f.filter((d) => $(d, n.attr)?.getAttribute(n.id) === n.pbsName).map((d) => ({
          pos: Number(A(d, n.posTick) ?? "0"),
          value: Number($(d, n.attr)?.textContent?.trim() ?? "0")
        })).filter((d) => Number.isFinite(d.pos) && Number.isFinite(d.value)), h = f.filter((d) => $(d, n.attr)?.getAttribute(n.id) === n.pitName).map((d) => ({
          pos: Number(A(d, n.posTick) ?? "0"),
          value: Number($(d, n.attr)?.textContent?.trim() ?? "0")
        })).filter((d) => Number.isFinite(d.pos) && Number.isFinite(d.value));
        return {
          startPos: m,
          pit: h,
          pbs: p
        };
      });
      a = Ut(u);
    }
    return pt({ id: e, name: o, notes: c, pitch: a });
  }
  function Ee(t, e) {
    const i = new DOMParser().parseFromString(t, "text/xml").documentElement;
    if (!i)
      throw new Error("VSQX root not found");
    const o = jt(t), s = Xt(o), c = $(i, s.masterTrack);
    if (!c)
      throw new Error("VSQX masterTrack not found");
    const a = [], u = Number(A(c, s.preMeasure) ?? "0"), { tickPrefix: l, timeSignatures: m } = Ae(c, s, u, a), f = Ie(c, s, l, a), p = Array.from(i.getElementsByTagName(s.vsTrack)).map(
      (h, d) => Me(h, d, s, l, e ?? {})
    );
    return {
      format: j.Vsqx,
      inputFiles: [],
      name: "vsqx",
      tracks: p,
      timeSignatures: m,
      tempos: f,
      ppq: 480,
      measurePrefix: u,
      importWarnings: a,
      japaneseLyricsType: S.Unknown,
      extras: {
        vsqx: {
          schemaVersion: o,
          originalXml: t,
          preservedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    };
  }
  function I(t, e) {
    const n = t.match(new RegExp(`<${e}>([\\s\\S]*?)</${e}>`));
    return n ? n[1].trim() : null;
  }
  function D(t, e) {
    return Array.from(t.matchAll(new RegExp(`<${e}>([\\s\\S]*?)</${e}>`, "g"))).map(
      (n) => n[1]
    );
  }
  function xt(t, e, n) {
    return D(t, e.mCtrl).map((r) => {
      const i = Number(I(r, e.posTick) ?? "0"), o = r.match(
        new RegExp(`<${e.attr}\\s+${e.id}="([^"]+)">([\\s\\S]*?)</${e.attr}>`)
      );
      if (!o || o[1] !== n)
        return null;
      const c = Number(nt(o[2]).trim());
      return !Number.isFinite(i) || !Number.isFinite(c) ? null : { pos: i, value: c };
    }).filter((r) => r !== null);
  }
  function _e(t, e) {
    const n = jt(t), r = Xt(n), i = t.match(/<masterTrack>([\s\S]*?)<\/masterTrack>/);
    if (!i) throw new Error("VSQX masterTrack not found");
    const o = i[1], s = [], c = Number(I(o, r.preMeasure) ?? "0"), a = D(o, r.timeSig).map((k) => {
      const g = Number(I(k, r.posMes)), T = Number(I(k, r.nume)), y = Number(I(k, r.denomi));
      return !Number.isFinite(g) || !Number.isFinite(T) || !Number.isFinite(y) ? null : { measurePosition: g, numerator: T, denominator: y };
    }).filter((k) => k !== null), u = a.length > 0 ? a : [{ measurePosition: 0, numerator: 4, denominator: 4 }];
    a.length === 0 && s.push({ kind: "TimeSignatureNotFound" });
    const l = Kt(u, c), m = u.map((k) => ({
      ...k,
      measurePosition: k.measurePosition - c
    })), f = m.slice(
      m.reduce((k, g, T) => g.measurePosition <= 0 ? T : k, 0)
    );
    f.length > 0 && (f[0] = { ...f[0], measurePosition: 0 });
    const p = D(o, r.tempo).map((k) => {
      const g = Number(I(k, r.posTick)), T = Number(I(k, r.bpm));
      return !Number.isFinite(g) || !Number.isFinite(T) ? null : { tickPosition: g - l, bpm: T / kt };
    }).filter((k) => k !== null), h = p.length > 0 ? p : [{ tickPosition: 0, bpm: 120 }];
    p.length === 0 && s.push({ kind: "TempoNotFound" });
    const d = h.slice(h.reduce((k, g, T) => g.tickPosition <= 0 ? T : k, 0));
    d.length > 0 && (d[0] = { ...d[0], tickPosition: 0 });
    const P = D(t, r.vsTrack).map((k, g) => {
      const T = nt(I(k, r.trackName) ?? `Track ${g + 1}`), y = D(k, r.musicalPart), x = y.flatMap((b) => {
        const N = Number(I(b, r.posTick) ?? "0") - l;
        return D(b, r.note).map((E) => ({ tickOffset: N, noteBlock: E }));
      }).map(({ tickOffset: b, noteBlock: N }, v) => {
        const E = Number(I(N, r.noteNum) ?? "0"), w = Number(I(N, r.posTick) ?? "0"), L = Number(I(N, r.duration) ?? "0"), K = nt(I(N, r.lyric) ?? e?.defaultLyric ?? "\u3042"), St = I(N, r.xSampa), oe = St == null ? void 0 : nt(St);
        return {
          id: v,
          key: E,
          lyric: K,
          tickOn: w + b,
          tickOff: w + b + L,
          phoneme: oe
        };
      });
      let O = null;
      if (!e?.simpleImport) {
        const b = y.map((N) => {
          const v = Number(I(N, r.posTick) ?? "0") - l, E = xt(N, r, r.pbsName), w = xt(N, r, r.pitName);
          return { startPos: v, pit: w, pbs: E };
        });
        O = Ut(b);
      }
      return pt({
        id: g,
        name: T,
        notes: x,
        pitch: O
      });
    });
    return {
      format: j.Vsqx,
      inputFiles: [],
      name: "vsqx",
      tracks: P,
      timeSignatures: f,
      tempos: d,
      ppq: 480,
      measurePrefix: c,
      importWarnings: s,
      japaneseLyricsType: S.Unknown,
      extras: {
        vsqx: {
          schemaVersion: n,
          originalXml: t,
          preservedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    };
  }
  function Er(t, e) {
    return typeof DOMParser < "u" ? Ee(t, e) : _e(t, e);
  }
  function Y(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function we(t, e, n) {
    if (t.notes.length === 0)
      return `<vsTrack><tNo>${e}</tNo><name>${Y(t.name)}</name></vsTrack>`;
    const r = t.notes[t.notes.length - 1].tickOff, i = "<singer><t>0</t><bs>0</bs><pc>0</pc></singer>", o = t.pitch ? Ne(t.pitch, t.notes) : null, c = (o ? [
      ...o.pbs.map((u) => ({ event: u, name: "S" })),
      ...o.pit.map((u) => ({ event: u, name: "P" }))
    ].sort((u, l) => u.event.pos - l.event.pos) : []).map(({ event: u, name: l }) => `<cc><t>${u.pos}</t><v id="${l}">${u.value}</v></cc>`).join(""), a = t.notes.map((u) => {
      const l = Y(u.lyric), m = u.phoneme ? `<p>${Y(u.phoneme)}</p>` : "";
      return [
        "<note>",
        `<t>${u.tickOn}</t>`,
        `<dur>${he(u)}</dur>`,
        `<n>${u.key}</n>`,
        `<y>${l}</y>`,
        m,
        "</note>"
      ].join("");
    }).join("");
    return [
      "<vsTrack>",
      `<tNo>${e}</tNo>`,
      `<name>${Y(t.name)}</name>`,
      "<comment><![CDATA[Track]]></comment>",
      "<vsPart>",
      `<t>${n}</t>`,
      `<playTime>${r}</playTime>`,
      "<name><![CDATA[NewPart]]></name>",
      "<comment><![CDATA[New Musical Part]]></comment>",
      i,
      c,
      a,
      "</vsPart>",
      "</vsTrack>"
    ].join("");
  }
  function Ve(t) {
    return [
      "<vsUnit>",
      `<tNo>${t}</tNo>`,
      "<iGin>0</iGin>",
      "<sLvl>-898</sLvl>",
      "<sEnable>0</sEnable>",
      "<m>0</m>",
      "<s>0</s>",
      "<pan>64</pan>",
      "<vol>0</vol>",
      "</vsUnit>"
    ].join("");
  }
  function _r(t, e) {
    const n = Math.max(t.measurePrefix, xe), r = t.timeSignatures[0] ?? { numerator: 4, denominator: 4 }, o = 1920 * r.numerator / r.denominator * n, s = t.timeSignatures.map((h, d) => `<timeSig><m>${d === 0 ? 0 : h.measurePosition + n}</m><nu>${h.numerator}</nu><de>${h.denominator}</de></timeSig>`).join(""), c = t.tempos.map((h, d) => `<tempo><t>${d === 0 ? 0 : h.tickPosition + o}</t><v>${Math.trunc(h.bpm * kt)}</v></tempo>`).join(""), a = t.tracks.map((h, d) => we(h, d, o)).join(""), u = t.tracks.map((h, d) => Ve(d)).join(""), m = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<vsq4 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq4/">',
      "<vender><![CDATA[Yamaha corporation]]></vender>",
      "<version><![CDATA[4.0.0.3]]></version>",
      [
        "<vVoiceTable>",
        "<vVoice>",
        "<bs>0</bs>",
        "<pc>0</pc>",
        "<id><![CDATA[BCXDC6CZLSZHZCB4]]></id>",
        "<name><![CDATA[VY2V3]]></name>",
        "<vPrm><bre>0</bre><bri>0</bri><cle>0</cle><gen>0</gen><ope>0</ope></vPrm>",
        "</vVoice>",
        "</vVoiceTable>"
      ].join(""),
      "<mixer>",
      "<masterUnit><oDev>0</oDev><rLvl>0</rLvl><vol>0</vol></masterUnit>",
      u,
      "<monoUnit><iGin>0</iGin><sLvl>-898</sLvl><sEnable>0</sEnable><m>0</m><s>0</s><pan>64</pan><vol>0</vol></monoUnit>",
      "<stUnit><iGin>0</iGin><m>0</m><s>0</s><vol>-129</vol></stUnit>",
      "</mixer>",
      "<masterTrack>",
      "<seqName><![CDATA[Untitled0]]></seqName>",
      "<comment><![CDATA[New VSQ File]]></comment>",
      "<resolution>480</resolution>",
      `<preMeasure>${n}</preMeasure>`,
      s,
      c,
      "</masterTrack>",
      a,
      "<monoTrack></monoTrack>",
      "<stTrack></stTrack>",
      "<aux><id><![CDATA[AUX_VST_HOST_CHUNK_INFO]]></id><content><![CDATA[VlNDSwAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=]]></content></aux>",
      "</vsq4>"
    ].join(""), p = t.tracks.some(
      (h) => h.notes.some((d) => d.phoneme !== void 0 && d.phoneme !== null)
    ) ? [] : [{ kind: "PhonemeResetRequiredV4" }];
    return {
      content: m,
      notifications: p,
      retainedExtras: e?.retainOriginalExtras === false ? void 0 : t.extras ?? {}
    };
  }
  var Fe = "2.0";
  var gt = 480;
  var lt = gt * 4;
  var B = 2;
  var q = 12;
  var Re = 60;
  function Ce(t) {
    return t.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }
  function qt(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function M(t, e) {
    const n = t.match(new RegExp(`<${e}(?:\\s[^>]*)?>([\\s\\S]*?)</${e}>`));
    return n ? n[1].trim() : null;
  }
  function rt(t, e) {
    return Array.from(t.matchAll(new RegExp(`<${e}(?:\\s[^>]*)?>([\\s\\S]*?)</${e}>`, "g"))).map(
      (n) => n[1]
    );
  }
  function Le(t) {
    return lt * t.numerator / t.denominator;
  }
  function De(t) {
    const n = t.match(/<tie\b[^>]*\btype="([^"]+)"/)?.[1];
    return n === "start" || n === "stop" ? n : null;
  }
  function $e(t) {
    const e = M(t, "pitch");
    if (!e) return Re;
    const n = M(e, "step"), r = Number(M(e, "alter") ?? "0"), i = Number(M(e, "octave") ?? "4"), o = n === "C" ? 0 : n === "D" ? 2 : n === "E" ? 4 : n === "F" ? 5 : n === "G" ? 7 : n === "A" ? 9 : n === "B" ? 11 : 0;
    return (i + 1) * q + o + r;
  }
  function Be(t) {
    const e = Math.floor(t / q) - 1;
    switch ((t % q + q) % q) {
      case 0:
        return { step: "C", octave: e };
      case 1:
        return { step: "C", alter: 1, octave: e };
      case 2:
        return { step: "D", octave: e };
      case 3:
        return { step: "D", alter: 1, octave: e };
      case 4:
        return { step: "E", octave: e };
      case 5:
        return { step: "F", octave: e };
      case 6:
        return { step: "F", alter: 1, octave: e };
      case 7:
        return { step: "G", octave: e };
      case 8:
        return { step: "G", alter: 1, octave: e };
      case 9:
        return { step: "A", octave: e };
      case 10:
        return { step: "A", alter: 1, octave: e };
      default:
        return { step: "B", octave: e };
    }
  }
  function Ue(t, e, n, r) {
    const i = rt(t, "measure"), o = r.importTickRate, s = [];
    let c = false;
    for (let a = 0; a < i.length; a += 1) {
      const u = i[a];
      let l = r.measureBorders[a] ?? 0;
      const m = rt(u, "note");
      for (const f of m) {
        const p = M(f, "duration");
        let h;
        if (p == null) {
          if (/<grace(\s|\/|>)/.test(f))
            continue;
          throw new Error("MusicXML duration not found");
        }
        if (h = Math.round(Number(p) * o), /<rest(\s|\/|>)/.test(f)) {
          l += h;
          continue;
        }
        const P = $e(f), k = Ce(M(M(f, "lyric") ?? "", "text") ?? n), g = c ? (() => {
          const y = s.pop();
          if (!y)
            throw new Error("MusicXML tie continuation note not found");
          return {
            ...y,
            tickOff: y.tickOff + h
          };
        })() : {
          id: 0,
          key: P,
          lyric: k,
          tickOn: l,
          tickOff: l + h
        };
        l += h, s.push(g);
        const T = De(f);
        T === "start" ? c = true : T === "stop" && (c = false);
      }
    }
    return {
      id: e,
      name: `Track ${e + 1}`,
      notes: s.map((a, u) => ({ ...a, id: u }))
    };
  }
  function je(t) {
    const e = rt(t, "measure"), n = e[0] ?? "", r = Number(M(n, "divisions") ?? M(t, "divisions") ?? "480") || 480, i = gt / r, o = [], s = [], c = [], a = [0];
    let u = { numerator: 4, denominator: 4 }, l = 0;
    for (let m = 0; m < e.length; m += 1) {
      const f = e[m], p = M(M(f, "time") ?? "", "beats"), h = M(M(f, "time") ?? "", "beat-type");
      if (p && h) {
        const P = {
          measurePosition: m,
          numerator: Number(p),
          denominator: Number(h)
        };
        o.push(P), u = P;
      }
      const d = f.match(/<sound[^>]*tempo="([^"]+)"/);
      d && s.push({
        tickPosition: l,
        bpm: Number(d[1])
      }), l += Le(u), a.push(l);
    }
    return o.length === 0 && c.push("TimeSignatureNotFound"), s.length === 0 && c.push("TempoNotFound"), {
      timeSignatures: o.length > 0 ? o : [{ measurePosition: 0, numerator: 4, denominator: 4 }],
      tempos: s.length > 0 ? s : [{ tickPosition: 0, bpm: 120 }],
      importTickRate: i,
      measureBorders: a,
      importWarnings: c
    };
  }
  function wr(t, e) {
    const n = rt(t, "part");
    if (n.length === 0)
      throw new Error("MusicXML part not found");
    const r = je(n[0]), i = n.map((o, s) => Ue(o, s, e?.defaultLyric ?? "\u3042", r));
    return {
      format: j.MusicXml,
      inputFiles: [],
      name: "musicxml",
      tracks: i,
      timeSignatures: r.timeSignatures,
      tempos: r.tempos,
      ppq: 480,
      measurePrefix: 0,
      importWarnings: r.importWarnings.map((o) => ({ kind: o })),
      japaneseLyricsType: S.Unknown,
      extras: {
        musicxml: {
          originalXml: t,
          preservedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    };
  }
  function Xe(t) {
    return {
      ...t,
      tempos: t.tempos.map((e) => ({
        ...e,
        tickPosition: Math.trunc(e.tickPosition * B)
      })),
      tracks: t.tracks.map((e) => ({
        ...e,
        notes: e.notes.map((n) => ({
          ...n,
          tickOn: Math.trunc(n.tickOn * B),
          tickOff: Math.trunc(n.tickOff * B)
        }))
      }))
    };
  }
  function Ke(t, e) {
    const n = t.tempos.map((o) => ({
      kind: "Tempo",
      tick: o.tickPosition,
      tempo: o
    })), r = e.notes.map((o) => ({
      kind: "NoteStart",
      tick: o.tickOn,
      note: o
    }));
    return [...e.notes.map((o) => ({
      kind: "NoteEnd",
      tick: o.tickOff,
      note: o
    })), ...n, ...r].sort((o, s) => o.tick - s.tick);
  }
  function qe(t, e) {
    if (t.length === 0)
      return [
        {
          tickStart: 0,
          length: lt * B,
          timeSignature: e.find((a) => a.measurePosition === 0) ?? null,
          contents: []
        }
      ];
    const n = new dt(1, lt * B), r = [0];
    for (const a of e) {
      const u = n.measure, l = n.ticksInMeasure;
      n.goToMeasure(a.measurePosition, a.numerator, a.denominator);
      const m = n.measure;
      for (let f = 0; f < m - u; f += 1)
        r.push(r[r.length - 1] + l);
    }
    const i = t[t.length - 1].tick;
    if (i >= n.tick + n.ticksInMeasure) {
      const a = n.measure, u = n.ticksInMeasure;
      n.goToTick(i);
      const l = n.measure;
      for (let m = 0; m < l - a; m += 1)
        r.push(r[r.length - 1] + u);
    }
    r.push(r[r.length - 1] + n.ticksInMeasure);
    const o = r.slice(0, -1).map((a, u) => {
      const l = r[u + 1], m = t.filter((f) => f.kind === "NoteEnd" ? f.tick > a && f.tick <= l : f.tick >= a && f.tick < l);
      return { start: a, end: l, group: m };
    }), s = /* @__PURE__ */ new Map();
    let c = null;
    for (const { start: a, end: u, group: l } of o) {
      let m = 0;
      const f = [];
      for (const h of l) {
        const d = h.tick - a;
        if (d > m && (c == null && f.push({
          kind: "Rest",
          duration: d - m
        }), m = d), h.kind === "Tempo")
          c == null ? f.push({ kind: "Tempo", bpm: h.tempo.bpm }) : (f.push({
            kind: "Note",
            duration: h.tick - c.head,
            note: c.note,
            noteType: c.note.tickOn === c.head ? "Begin" : "Middle"
          }), c = { note: c.note, head: h.tick }, f.push({ kind: "Tempo", bpm: h.tempo.bpm }));
        else if (h.kind === "NoteStart")
          c = { note: h.note, head: h.tick };
        else {
          if (c == null)
            throw new Error("MusicXML ongoing note not found");
          f.push({
            kind: "Note",
            duration: h.note.tickOff - c.head,
            note: h.note,
            noteType: h.note.tickOn === c.head ? "Single" : "End"
          }), c = null;
        }
      }
      const p = u - a - m;
      p > 0 && (c == null ? f.push({ kind: "Rest", duration: p }) : (f.push({
        kind: "Note",
        duration: u - c.head,
        note: c.note,
        noteType: c.note.tickOn === c.head ? "Begin" : "Middle"
      }), c = { note: c.note, head: u })), s.set(`${a}:${u}`, f);
    }
    return Array.from(s.entries()).map(([a, u], l) => {
      const [m, f] = a.split(":"), p = Number(m), h = Number(f);
      return {
        tickStart: p,
        length: h - p,
        timeSignature: e.find((d) => d.measurePosition === l) ?? null,
        contents: u
      };
    }).sort((a, u) => a.tickStart - u.tickStart);
  }
  function Ge(t, e) {
    const n = t === "Begin" ? "begin" : t === "Middle" ? "middle" : t === "End" ? "end" : "single", r = t === "Begin" || t === "Single" ? `<text>${qt(e)}</text>` : "<text></text>";
    return ["<lyric>", `<syllabic>${n}</syllabic>`, r, "</lyric>"].join("");
  }
  function We(t, e, n) {
    const r = Be(t.key), i = r.alter != null ? `<alter>${r.alter}</alter>` : "", o = n === "Begin" ? "start" : n === "End" ? "stop" : null, s = o == null ? "" : `<tie type="${o}"/>`, c = o == null ? "" : `<notations><tied type="${o}"/></notations>`;
    return [
      "<note>",
      "<pitch>",
      `<step>${r.step}</step>`,
      i,
      `<octave>${r.octave}</octave>`,
      "</pitch>",
      `<duration>${e}</duration>`,
      s,
      c,
      Ge(n, t.lyric),
      "</note>"
    ].join("");
  }
  function ze(t) {
    return [
      `<sound tempo="${t}"/>`,
      "<direction>",
      "<direction-type>",
      "<metronome>",
      "<beat-unit>quarter</beat-unit>",
      `<per-minute>${t}</per-minute>`,
      "</metronome>",
      "</direction-type>",
      `<sound tempo="${t}"/>`,
      "</direction>"
    ].join("");
  }
  function He(t) {
    return ["<note>", "<rest/>", `<duration>${t}</duration>`, "</note>"].join("");
  }
  function Ye(t, e) {
    return [
      "<attributes>",
      e ? `<divisions>${Math.trunc(gt * B)}</divisions>` : "",
      "<time>",
      `<beats>${t.numerator}</beats>`,
      `<beat-type>${t.denominator}</beat-type>`,
      "</time>",
      "</attributes>"
    ].join("");
  }
  function Qe(t, e) {
    const n = e.map((r, i) => {
      const o = r.contents.map((c) => c.kind === "Tempo" ? ze(c.bpm) : c.kind === "Rest" ? He(c.duration) : We(c.note, c.duration, c.noteType)).join(""), s = r.timeSignature != null ? Ye(r.timeSignature, i === 0) : "";
      return [`<measure number="${i + 1}">`, s, o, "</measure>"].join("");
    }).join("");
    return [
      `<part id="P${t.id + 1}">`,
      n,
      "</part>"
    ].join("");
  }
  function Vr(t, e) {
    if ((e?.mode ?? "generate") === "preserve" && e?.noOp && e.originalText != null)
      return e.originalText;
    const r = Xe(t), i = r.tracks.length > 0 ? r.tracks : [{ id: 0, name: "Track 1", notes: [] }], o = r.timeSignatures.length > 0 ? r.timeSignatures : [{ measurePosition: 0, numerator: 4, denominator: 4 }], s = [
      "<part-list>",
      ...i.map(
        (a) => `<score-part id="P${a.id + 1}"><part-name>${qt(a.name || `Track ${a.id + 1}`)}</part-name></score-part>`
      ),
      "</part-list>"
    ].join(""), c = i.map((a) => {
      const u = Ke(r, a), l = qe(u, o);
      return Qe(a, l);
    }).join("");
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<score-partwise version="${Fe}">`,
      s,
      c,
      "</score-partwise>"
    ].join("");
  }
  var z = 4.8 / 120;
  var bt = class bt2 {
    constructor(e = "", n = false) {
      this.mapText = e, this.mapToPhonemes = n;
    }
    get isValid() {
      return this.map.size > 0;
    }
    get map() {
      return new Map(
        this.mapText.split(/\r?\n/).map((e) => {
          if (!e.includes("="))
            return null;
          const n = e.slice(0, e.indexOf("=")).trim(), r = e.slice(e.indexOf("=") + 1).trim();
          return [n, r];
        }).filter((e) => e != null)
      );
    }
    static findPreset(e) {
      return this.Presets.find(([n]) => n === e)?.[1];
    }
    static getPreset(e) {
      const n = this.findPreset(e);
      if (!n)
        throw new Error(`Lyrics mapping preset not found: ${e}`);
      return n;
    }
  };
  bt.Presets = [];
  var U = [
    ["\u3042", "a"],
    ["\u3044", "i"],
    ["\u3044\u3047", "ye"],
    ["\u3046", "u"],
    ["\u308F", "wa"],
    ["\u3046\u3041", "wa"],
    ["\u3046\u3041", "ua"],
    ["\u3046\u3043", "wi"],
    ["\u3046\u3043", "ui"],
    ["\u3046\u3047", "we"],
    ["\u3048", "e"],
    ["\u304A", "o"],
    ["\u304B", "ka"],
    ["\u304C", "ga"],
    ["\u304D", "ki"],
    ["\u304D\u3047", "kye"],
    ["\u304D\u3083", "kya"],
    ["\u304D\u3085", "kyu"],
    ["\u304D\u3087", "kyo"],
    ["\u304E", "gi"],
    ["\u304E\u3047", "gye"],
    ["\u304E\u3083", "gya"],
    ["\u304E\u3085", "gyu"],
    ["\u304E\u3087", "gyo"],
    ["\u304F", "ku"],
    ["\u304F\u3041", "kua"],
    ["\u304F\u3043", "kui"],
    ["\u304F\u3047", "kue"],
    ["\u304F\u3049", "kuo"],
    ["\u3050", "gu"],
    ["\u3050\u3041", "gua"],
    ["\u3050\u3043", "gui"],
    ["\u3050\u3047", "gue"],
    ["\u3050\u3049", "guo"],
    ["\u3051", "ke"],
    ["\u3052", "ge"],
    ["\u3053", "ko"],
    ["\u3054", "go"],
    ["\u3055", "sa"],
    ["\u3056", "za"],
    ["\u3057", "shi"],
    ["\u3057", "si"],
    ["\u3057\u3047", "she"],
    ["\u3057\u3047", "sye"],
    ["\u3057\u3083", "sha"],
    ["\u3057\u3083", "sya"],
    ["\u3057\u3085", "shu"],
    ["\u3057\u3085", "syu"],
    ["\u3057\u3087", "sho"],
    ["\u3057\u3087", "syo"],
    ["\u3058", "ji"],
    ["\u3058\u3047", "je"],
    ["\u3058\u3047", "jye"],
    ["\u3058\u3083", "ja"],
    ["\u3058\u3083", "jya"],
    ["\u3058\u3085", "ju"],
    ["\u3058\u3085", "jyu"],
    ["\u3058\u3087", "jo"],
    ["\u3058\u3087", "jyo"],
    ["\u3059", "su"],
    ["\u3059\u3041", "sua"],
    ["\u3059\u3043", "sui"],
    ["\u3059\u3047", "sue"],
    ["\u3059\u3049", "suo"],
    ["\u305A", "zu"],
    ["\u305A\u3041", "zua"],
    ["\u305A\u3043", "zui"],
    ["\u305A\u3047", "zue"],
    ["\u305A\u3049", "zuo"],
    ["\u305B", "se"],
    ["\u305C", "ze"],
    ["\u305D", "so"],
    ["\u305E", "zo"],
    ["\u305F", "ta"],
    ["\u3060", "da"],
    ["\u3061", "chi"],
    ["\u3061\u3047", "che"],
    ["\u3061\u3083", "cha"],
    ["\u3061\u3085", "chu"],
    ["\u3061\u3087", "cho"],
    ["\u3064", "tsu"],
    ["\u3064", "tu"],
    ["\u3064\u3041", "tsa"],
    ["\u3064\u3041", "tua"],
    ["\u3064\u3043", "tsi"],
    ["\u3064\u3043", "tui"],
    ["\u3064\u3047", "tse"],
    ["\u3064\u3047", "tue"],
    ["\u3064\u3049", "tso"],
    ["\u3064\u3049", "tuo"],
    ["\u3066", "te"],
    ["\u3066\u3043", "ti"],
    ["\u3066\u3085", "tyu"],
    ["\u3067", "de"],
    ["\u3067\u3043", "di"],
    ["\u3067\u3085", "dyu"],
    ["\u3068", "to"],
    ["\u3068\u3045", "tu"],
    ["\u3068\u3045", "twu"],
    ["\u3069", "do"],
    ["\u3069\u3045", "du"],
    ["\u3069\u3045", "dwu"],
    ["\u306A", "na"],
    ["\u306B", "ni"],
    ["\u306B\u3047", "nye"],
    ["\u306B\u3083", "nya"],
    ["\u306B\u3085", "nyu"],
    ["\u306B\u3087", "nyo"],
    ["\u306C", "nu"],
    ["\u306C\u3041", "nua"],
    ["\u306C\u3043", "nui"],
    ["\u306C\u3047", "nue"],
    ["\u306C\u3049", "nuo"],
    ["\u306D", "ne"],
    ["\u306E", "no"],
    ["\u306F", "ha"],
    ["\u3070", "ba"],
    ["\u3071", "pa"],
    ["\u3072", "hi"],
    ["\u3072\u3047", "hye"],
    ["\u3072\u3083", "hya"],
    ["\u3072\u3085", "hyu"],
    ["\u3072\u3087", "hyo"],
    ["\u3073", "bi"],
    ["\u3073\u3047", "bye"],
    ["\u3073\u3083", "bya"],
    ["\u3073\u3085", "byu"],
    ["\u3073\u3087", "byo"],
    ["\u3074", "pi"],
    ["\u3074\u3047", "pye"],
    ["\u3074\u3083", "pya"],
    ["\u3074\u3085", "pyu"],
    ["\u3074\u3087", "pyo"],
    ["\u3075", "fu"],
    ["\u3075\u3041", "fa"],
    ["\u3075\u3043", "fi"],
    ["\u3075\u3047", "fe"],
    ["\u3075\u3049", "fo"],
    ["\u3076", "bu"],
    ["\u3076\u3041", "bua"],
    ["\u3076\u3043", "bui"],
    ["\u3076\u3047", "bue"],
    ["\u3076\u3049", "buo"],
    ["\u3077", "pu"],
    ["\u3077\u3041", "pua"],
    ["\u3077\u3043", "pui"],
    ["\u3077\u3047", "pue"],
    ["\u3077\u3049", "puo"],
    ["\u3078", "he"],
    ["\u3079", "be"],
    ["\u307A", "pe"],
    ["\u307B", "ho"],
    ["\u307C", "bo"],
    ["\u307D", "po"],
    ["\u307E", "ma"],
    ["\u307F", "mi"],
    ["\u307F\u3047", "mye"],
    ["\u307F\u3083", "mya"],
    ["\u307F\u3085", "myu"],
    ["\u307F\u3087", "myo"],
    ["\u3080", "mu"],
    ["\u3080\u3041", "mua"],
    ["\u3080\u3043", "mui"],
    ["\u3080\u3047", "mue"],
    ["\u3080\u3049", "muo"],
    ["\u3081", "me"],
    ["\u3082", "mo"],
    ["\u3084", "ya"],
    ["\u3086", "yu"],
    ["\u3088", "yo"],
    ["\u3089", "ra"],
    ["\u308A", "ri"],
    ["\u308A\u3047", "rye"],
    ["\u308A\u3083", "rya"],
    ["\u308A\u3085", "ryu"],
    ["\u308A\u3087", "ryo"],
    ["\u308B", "ru"],
    ["\u308B\u3041", "rua"],
    ["\u308B\u3043", "rui"],
    ["\u308B\u3047", "rue"],
    ["\u308B\u3049", "ruo"],
    ["\u308C", "re"],
    ["\u308D", "ro"],
    ["\u308F", "wa"],
    ["\u3092", "o"],
    ["\u3046\u3049", "wo"],
    ["\u3093", "n"],
    ["\u30FC", "-"]
  ];
  var ur = U.map((t) => t[0]);
  var Pt = U.map((t) => t[1]);

  // src/musicxml/KeyFifthsEstimator.ts
  var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  var FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
  var PITCH_CANDIDATES = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 }
  ];
  function clampFifths(value) {
    return Math.max(-7, Math.min(7, Math.trunc(value)));
  }
  function defaultAlterFromFifths(step, fifths) {
    const clamped = clampFifths(fifths);
    if (clamped > 0 && SHARP_ORDER.slice(0, clamped).includes(step)) return 1;
    if (clamped < 0 && FLAT_ORDER.slice(0, -clamped).includes(step)) return -1;
    return 0;
  }
  function toPitch(key) {
    const pitchClass = (Math.trunc(key) % 12 + 12) % 12;
    return PITCH_CANDIDATES[pitchClass];
  }
  function collectMeasureNotes(notes, measure) {
    return notes.map((note) => ({
      key: note.key,
      duration: Math.max(
        0,
        Math.min(note.tickOff, measure.startTick + measure.lengthTick) - Math.max(note.tickOn, measure.startTick)
      )
    })).filter((it) => it.duration > 0);
  }
  function scoreMeasureNotesForFifths(inMeasure, fifths) {
    let penalty = 0;
    for (const item of inMeasure) {
      const pitch = toPitch(item.key);
      const keyAlter = defaultAlterFromFifths(pitch.step, fifths);
      penalty += Math.abs(pitch.alter - keyAlter) * item.duration;
    }
    return penalty;
  }
  function estimateTrackKeyFifths(notes) {
    if (notes.length === 0) return 0;
    let best = 0;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (let fifths = -7; fifths <= 7; fifths += 1) {
      let penalty = 0;
      for (const note of notes) {
        const pitch = toPitch(note.key);
        const keyAlter = defaultAlterFromFifths(pitch.step, fifths);
        penalty += Math.abs(pitch.alter - keyAlter);
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = fifths;
      }
    }
    return clampFifths(best);
  }
  function estimateMeasureKeyFifthsSequence(notes, measures, fallbackFifths) {
    const sequence = [];
    let previous = clampFifths(fallbackFifths);
    for (const measure of measures) {
      const inMeasure = collectMeasureNotes(notes, measure);
      if (inMeasure.length === 0) {
        sequence.push(previous);
        continue;
      }
      let best = previous;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestFitScore = Number.POSITIVE_INFINITY;
      for (let fifths = -7; fifths <= 7; fifths += 1) {
        const fitScore = scoreMeasureNotesForFifths(inMeasure, fifths);
        const continuityPenalty = Math.abs(fifths - previous) * 0.25;
        const baselinePenalty = Math.abs(fifths - fallbackFifths) * 0.02;
        const score = fitScore + continuityPenalty + baselinePenalty;
        if (score < bestScore) {
          bestScore = score;
          bestFitScore = fitScore;
          best = fifths;
        }
      }
      if (best !== previous) {
        const previousFitScore = scoreMeasureNotesForFifths(inMeasure, previous);
        const totalDuration = inMeasure.reduce((acc, it) => acc + it.duration, 0);
        const requiredImprovement = Math.max(360, totalDuration * 0.25);
        const improvement = previousFitScore - bestFitScore;
        if (improvement <= requiredImprovement) {
          best = previous;
        }
      }
      previous = clampFifths(best);
      sequence.push(previous);
    }
    return sequence;
  }

  // src/musicxml/ProjectToMusicXml.ts
  var PITCH_CANDIDATES2 = [
    [{ step: "C", alter: 0 }],
    [{ step: "C", alter: 1 }, { step: "D", alter: -1 }],
    [{ step: "D", alter: 0 }],
    [{ step: "D", alter: 1 }, { step: "E", alter: -1 }],
    [{ step: "E", alter: 0 }],
    [{ step: "F", alter: 0 }],
    [{ step: "F", alter: 1 }, { step: "G", alter: -1 }],
    [{ step: "G", alter: 0 }],
    [{ step: "G", alter: 1 }, { step: "A", alter: -1 }],
    [{ step: "A", alter: 0 }],
    [{ step: "A", alter: 1 }, { step: "B", alter: -1 }],
    [{ step: "B", alter: 0 }]
  ];
  var STEPS_IN_SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
  var STEPS_IN_FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
  function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function unwrapCdata(value) {
    let current = String(value ?? "");
    const cdataPattern = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
    while (true) {
      const match = current.match(cdataPattern);
      if (!match) return current;
      current = match[1];
    }
  }
  function normalizeText(value) {
    return unwrapCdata(String(value ?? ""));
  }
  function shouldInterpretHyphenAsSyllabic(japaneseLyricsType) {
    return japaneseLyricsType === "RomajiCv" || japaneseLyricsType === "RomajiVcv";
  }
  function resolveLyricAndSyllabic(rawLyric, options) {
    const normalized = normalizeText(rawLyric).trim();
    if (!normalized) return { lyric: "", syllabic: "" };
    const useHyphenRule = options?.interpretHyphenAsSyllabic ?? false;
    if (!useHyphenRule) {
      return { lyric: normalized, syllabic: "single" };
    }
    const beginsWithHyphen = normalized.startsWith("-");
    const endsWithHyphen = normalized.endsWith("-");
    const text = normalized.replace(/^-+/, "").replace(/-+$/, "").trim();
    if (!text) return { lyric: "", syllabic: "" };
    if (beginsWithHyphen && endsWithHyphen) {
      return { lyric: text, syllabic: "middle" };
    }
    if (beginsWithHyphen) {
      return { lyric: text, syllabic: "end" };
    }
    if (endsWithHyphen) {
      return { lyric: text, syllabic: "begin" };
    }
    return { lyric: text, syllabic: "single" };
  }
  function buildDurationSpecs(divisions) {
    const candidates = [
      { type: "whole", base: divisions * 4 },
      { type: "half", base: divisions * 2 },
      { type: "quarter", base: divisions },
      { type: "eighth", base: divisions / 2 },
      { type: "16th", base: divisions / 4 },
      { type: "32nd", base: divisions / 8 },
      { type: "64th", base: divisions / 16 },
      { type: "128th", base: divisions / 32 }
    ];
    const specs = [];
    for (const candidate of candidates) {
      if (!(candidate.base > 0) || !Number.isInteger(candidate.base)) continue;
      specs.push({ duration: candidate.base, type: candidate.type, dots: 0 });
      if (Number.isInteger(candidate.base * 3 / 2)) {
        specs.push({ duration: candidate.base * 3 / 2, type: candidate.type, dots: 1 });
      }
      if (Number.isInteger(candidate.base * 7 / 4)) {
        specs.push({ duration: candidate.base * 7 / 4, type: candidate.type, dots: 2 });
      }
    }
    const dedup = /* @__PURE__ */ new Map();
    for (const spec of specs) {
      const key = `${spec.duration}:${spec.type}:${spec.dots}`;
      if (!dedup.has(key)) dedup.set(key, spec);
    }
    return Array.from(dedup.values()).sort((a, b) => b.duration - a.duration);
  }
  function noteTypeFromDuration(duration, divisions) {
    const spec = buildDurationSpecs(divisions).find((it) => it.duration === duration);
    if (spec) return { type: spec.type, dots: spec.dots };
    return null;
  }
  function decomposeDuration(duration, divisions) {
    const specs = buildDurationSpecs(divisions);
    const memo = /* @__PURE__ */ new Map();
    const maxParts = 16;
    const dfs = (remaining, depth) => {
      if (remaining === 0) return [];
      if (remaining < 0 || depth >= maxParts) return null;
      const cached = memo.get(remaining);
      if (cached !== void 0) return cached;
      for (const spec of specs) {
        if (spec.duration > remaining) continue;
        const tail = dfs(remaining - spec.duration, depth + 1);
        if (tail) {
          const result = [spec, ...tail];
          memo.set(remaining, result);
          return result;
        }
      }
      memo.set(remaining, null);
      return null;
    };
    return dfs(Math.max(0, Math.trunc(duration)), 0);
  }
  function accidentalTextFromAlter(alter) {
    if (!Number.isFinite(alter)) return null;
    const normalized = Math.trunc(alter);
    if (normalized === 2) return "double-sharp";
    if (normalized === 1) return "sharp";
    if (normalized === 0) return "natural";
    if (normalized === -1) return "flat";
    if (normalized === -2) return "double-flat";
    return null;
  }
  function pitchStateKey(pitch) {
    return `${pitch.step}:${pitch.octave}`;
  }
  function clampFifths2(value) {
    return Math.max(-7, Math.min(7, Math.trunc(value)));
  }
  function defaultAlterFromFifths2(step, fifths) {
    const f = clampFifths2(fifths);
    if (f > 0 && STEPS_IN_SHARP_ORDER.slice(0, f).includes(step)) {
      return 1;
    }
    if (f < 0 && STEPS_IN_FLAT_ORDER.slice(0, -f).includes(step)) {
      return -1;
    }
    return 0;
  }
  function getPreviousAlterForPitch(pitch, context) {
    const stateKey = pitchStateKey(pitch);
    const mapped = context.accidentalState.get(stateKey);
    if (mapped != null) return mapped;
    return defaultAlterFromFifths2(pitch.step, context.keyFifths);
  }
  function toFiniteNumberOrUndefined(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
    return value;
  }
  function parseFifthsByTrackValue(value, index) {
    if (Array.isArray(value)) {
      return toFiniteNumberOrUndefined(value[index]);
    }
    if (value && typeof value === "object") {
      const record = value;
      return toFiniteNumberOrUndefined(record[String(index)]);
    }
    return void 0;
  }
  function parseFifthsByMeasureValue(value, trackIndex, measureIndex) {
    if (Array.isArray(value)) {
      const trackValue = value[trackIndex];
      if (!Array.isArray(trackValue)) return void 0;
      return toFiniteNumberOrUndefined(trackValue[measureIndex]);
    }
    if (value && typeof value === "object") {
      const record = value;
      const trackValue = record[String(trackIndex)];
      if (!Array.isArray(trackValue)) return void 0;
      return toFiniteNumberOrUndefined(trackValue[measureIndex]);
    }
    return void 0;
  }
  function resolveTrackFifthsFromExtras(project, index) {
    const extras = project.extras;
    if (!extras || typeof extras !== "object") return void 0;
    const root = extras;
    const musicxml = root.musicxml && typeof root.musicxml === "object" ? root.musicxml : null;
    const byTrackCandidates = [
      root.keyFifthsByTrack,
      musicxml?.keyFifthsByTrack
    ];
    for (const candidate of byTrackCandidates) {
      const parsed = parseFifthsByTrackValue(candidate, index);
      if (parsed !== void 0) return parsed;
    }
    const globalCandidates = [
      root.keyFifths,
      musicxml?.keyFifths
    ];
    for (const candidate of globalCandidates) {
      const parsed = toFiniteNumberOrUndefined(candidate);
      if (parsed !== void 0) return parsed;
    }
    return void 0;
  }
  function resolveMeasureFifthsFromExtras(project, trackIndex, measureIndex) {
    const extras = project.extras;
    if (!extras || typeof extras !== "object") return void 0;
    const root = extras;
    const musicxml = root.musicxml && typeof root.musicxml === "object" ? root.musicxml : null;
    const candidates = [
      root.keyFifthsByMeasure,
      musicxml?.keyFifthsByMeasure
    ];
    for (const candidate of candidates) {
      const parsed = parseFifthsByMeasureValue(candidate, trackIndex, measureIndex);
      if (parsed !== void 0) return parsed;
    }
    return void 0;
  }
  function resolveTrackKeyFifths(project, track, index, options) {
    const explicit = options?.keyFifths;
    if (typeof explicit === "number" && Number.isFinite(explicit)) {
      return clampFifths2(explicit);
    }
    if (Array.isArray(explicit)) {
      const perTrack = toFiniteNumberOrUndefined(explicit[index]);
      if (perTrack !== void 0) return clampFifths2(perTrack);
    }
    const preferProjectExtras = options?.preferProjectExtras ?? true;
    if (preferProjectExtras) {
      const fromExtras = resolveTrackFifthsFromExtras(project, index);
      if (fromExtras !== void 0) return clampFifths2(fromExtras);
    }
    return clampFifths2(estimateTrackKeyFifths(track.notes));
  }
  function resolveMeasureKeyFifths(project, trackIndex, measureIndex, baseTrackFifths, estimatedByMeasure, options) {
    const explicitTrackLevel = options?.keyFifths;
    if (explicitTrackLevel !== void 0) {
      return clampFifths2(baseTrackFifths);
    }
    const explicitByMeasure = options?.keyFifthsByMeasure;
    const fromOptions = parseFifthsByMeasureValue(explicitByMeasure, trackIndex, measureIndex);
    if (fromOptions !== void 0) return clampFifths2(fromOptions);
    const preferProjectExtras = options?.preferProjectExtras ?? true;
    if (preferProjectExtras) {
      const fromExtras = resolveMeasureFifthsFromExtras(project, trackIndex, measureIndex);
      if (fromExtras !== void 0) return clampFifths2(fromExtras);
    }
    if (estimatedByMeasure) {
      const estimated = estimatedByMeasure[measureIndex];
      if (typeof estimated === "number" && Number.isFinite(estimated)) {
        return clampFifths2(estimated);
      }
    }
    return clampFifths2(baseTrackFifths);
  }
  function choosePitchSpelling(key, context) {
    const normalized = (Math.trunc(key) % 12 + 12) % 12;
    const octave = Math.floor(key / 12) - 1;
    const candidates = PITCH_CANDIDATES2[normalized];
    if (candidates.length === 1) {
      return { step: candidates[0].step, alter: candidates[0].alter, octave };
    }
    const previousKey = context.previousKey;
    const scored = candidates.map((candidate, index) => {
      const pitch = { step: candidate.step, alter: candidate.alter, octave };
      const prevAlter = getPreviousAlterForPitch(pitch, context);
      const needsAccidental = prevAlter === candidate.alter ? 0 : 1;
      const keyAlter = defaultAlterFromFifths2(candidate.step, context.keyFifths);
      const keyBias = Math.abs(candidate.alter - keyAlter) * 0.5;
      const directionBias = previousKey == null ? 0 : key < previousKey ? candidate.alter < 0 ? -0.25 : 0 : key > previousKey ? candidate.alter > 0 ? -0.25 : 0 : 0;
      return {
        index,
        candidate,
        score: needsAccidental + keyBias + directionBias
      };
    });
    scored.sort((a, b) => a.score - b.score || a.index - b.index);
    const selected = scored[0].candidate;
    return { step: selected.step, alter: selected.alter, octave };
  }
  function resolveAccidentalText(pitch, context, suppress) {
    const stateKey = pitchStateKey(pitch);
    const currentAlter = Math.trunc(pitch.alter);
    const prevAlter = getPreviousAlterForPitch(pitch, context);
    context.accidentalState.set(stateKey, currentAlter);
    if (suppress || currentAlter === prevAlter) return null;
    return accidentalTextFromAlter(currentAlter);
  }
  function sortTimeSignatures(project) {
    const sorted = [...project.timeSignatures].filter((ts) => ts.numerator > 0 && ts.denominator > 0).sort((a, b) => a.measurePosition - b.measurePosition);
    if (sorted.length === 0 || sorted[0].measurePosition !== 0) {
      sorted.unshift({ measurePosition: 0, numerator: 4, denominator: 4 });
    }
    return sorted;
  }
  function ticksPerMeasure(ppq, ts) {
    return Math.round(ppq * 4 * ts.numerator / ts.denominator);
  }
  function getMeasureTimeSignature(index, list) {
    let active = list[0];
    for (const ts of list) {
      if (ts.measurePosition <= index) active = ts;
      else break;
    }
    return active;
  }
  function tickAtMeasurePosition(position, ppq, tsList) {
    const safePosition = Math.max(0, Math.trunc(position));
    let tick = 0;
    for (let index = 0; index < safePosition; index += 1) {
      tick += Math.max(1, ticksPerMeasure(ppq, getMeasureTimeSignature(index, tsList)));
    }
    return tick;
  }
  function normalizeTempos(projectTempos) {
    const valid = projectTempos.filter((tempo) => Number.isFinite(tempo.tickPosition) && Number.isFinite(tempo.bpm) && tempo.bpm > 0).map((tempo) => ({
      tickPosition: Math.max(0, Math.trunc(tempo.tickPosition)),
      bpm: tempo.bpm
    })).sort((a, b) => a.tickPosition - b.tickPosition);
    const merged = [];
    for (const tempo of valid) {
      const last = merged[merged.length - 1];
      if (last && last.tickPosition === tempo.tickPosition) {
        last.bpm = tempo.bpm;
      } else {
        merged.push({ tickPosition: tempo.tickPosition, bpm: tempo.bpm });
      }
    }
    if (merged.length === 0) {
      return [{ tickPosition: 0, bpm: 120 }];
    }
    if (merged[0].tickPosition !== 0) {
      return [{ tickPosition: 0, bpm: merged[0].bpm }, ...merged];
    }
    return merged;
  }
  function buildMeasures(project, maxTick) {
    const ppq = project.ppq > 0 ? project.ppq : 480;
    const tsList = sortTimeSignatures(project);
    const measures = [];
    let startTick = 0;
    let index = 0;
    const hardLimit = 1e4;
    while (startTick <= maxTick && index < hardLimit) {
      const ts = getMeasureTimeSignature(index, tsList);
      const lengthTick = Math.max(1, ticksPerMeasure(ppq, ts));
      measures.push({ index, startTick, lengthTick, timeSignature: ts });
      startTick += lengthTick;
      index += 1;
    }
    if (measures.length === 0) {
      const ts = getMeasureTimeSignature(0, tsList);
      measures.push({ index: 0, startTick: 0, lengthTick: Math.max(1, ticksPerMeasure(ppq, ts)), timeSignature: ts });
    }
    return measures;
  }
  function chooseClef(track) {
    if (!track.notes.length) {
      return { sign: "G", line: 2 };
    }
    const sorted = track.notes.map((note) => note.key).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 60;
    if (median < 60) {
      return { sign: "F", line: 4 };
    }
    return { sign: "G", line: 2 };
  }
  function renderAttributes(measure, divisions, clef, keyFifths) {
    const ts = measure.timeSignature;
    return `<attributes><divisions>${divisions}</divisions><key><fifths>${clampFifths2(keyFifths)}</fifths></key><time><beats>${ts.numerator}</beats><beat-type>${ts.denominator}</beat-type></time><clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef></attributes>`;
  }
  function renderTempoDirections(measure, tempos) {
    const endTick = measure.startTick + measure.lengthTick;
    return tempos.filter((tempo) => tempo.tickPosition >= measure.startTick && tempo.tickPosition < endTick).sort((a, b) => a.tickPosition - b.tickPosition).map((tempo) => {
      const offset = tempo.tickPosition - measure.startTick;
      return `<direction>${offset > 0 ? `<offset>${offset}</offset>` : ""}<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo.bpm}</per-minute></metronome></direction-type><sound tempo="${tempo.bpm}"/></direction>`;
    }).join("");
  }
  function renderRest(duration, voice, divisions) {
    const specs = decomposeDuration(duration, divisions);
    if (!specs || specs.length === 0) {
      return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice></note>`;
    }
    return specs.map((spec) => {
      return `<note><rest/><duration>${spec.duration}</duration><voice>${voice}</voice><type>${spec.type}</type>${"<dot/>".repeat(spec.dots)}</note>`;
    }).join("");
  }
  function renderSingleNote(pitch, duration, voice, noteType, tieStart, tieStop, lyric, syllabic, accidentalText, options) {
    const isChordTone = options?.chord === true;
    return `<note>${isChordTone ? `<chord/>` : ""}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>${accidentalText ? `<accidental>${accidentalText}</accidental>` : ""}<duration>${duration}</duration><voice>${voice}</voice>${noteType ? `<type>${noteType.type}</type>${"<dot/>".repeat(noteType.dots)}` : ""}${tieStart ? `<tie type="start"/>` : ""}${tieStop ? `<tie type="stop"/>` : ""}${tieStart || tieStop ? `<notations>${tieStart ? `<tied type="start"/>` : ""}${tieStop ? `<tied type="stop"/>` : ""}</notations>` : ""}${lyric ? `<lyric>${syllabic ? `<syllabic>${syllabic}</syllabic>` : ""}<text>${lyric}</text></lyric>` : ""}</note>`;
  }
  function renderNoteSegment(project, note, startTick, endTick, divisions, voice, spellingContext, options) {
    const duration = Math.max(1, endTick - startTick);
    const extTieStart = endTick < note.tickOff;
    const extTieStop = startTick > note.tickOn;
    const isFirstSegment = startTick === note.tickOn;
    const includeLyric = options?.lyric ?? true;
    const lyricToken = includeLyric && isFirstSegment ? resolveLyricAndSyllabic(note.lyric || "\u3042", {
      interpretHyphenAsSyllabic: shouldInterpretHyphenAsSyllabic(project.japaneseLyricsType)
    }) : { lyric: "", syllabic: "" };
    const lyric = escapeXml(lyricToken.lyric);
    const syllabic = lyricToken.syllabic;
    const pitch = choosePitchSpelling(note.key, spellingContext);
    const accidentalText = resolveAccidentalText(pitch, spellingContext, extTieStop);
    spellingContext.previousKey = note.key;
    if (options?.chord) {
      return renderSingleNote(
        pitch,
        duration,
        voice,
        noteTypeFromDuration(duration, divisions),
        extTieStart,
        extTieStop,
        lyric,
        syllabic,
        accidentalText,
        options
      );
    }
    const specs = decomposeDuration(duration, divisions);
    if (!specs || specs.length <= 1) {
      return renderSingleNote(
        pitch,
        duration,
        voice,
        noteTypeFromDuration(duration, divisions),
        extTieStart,
        extTieStop,
        lyric,
        syllabic,
        accidentalText,
        options
      );
    }
    let out = "";
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      const tieStop = extTieStop || i > 0;
      const tieStart = extTieStart || i < specs.length - 1;
      const lyricForPart = i === 0 ? lyric : "";
      const syllabicForPart = i === 0 ? syllabic : "";
      const accidentalForPart = i === 0 ? accidentalText : null;
      out += renderSingleNote(
        pitch,
        spec.duration,
        voice,
        { type: spec.type, dots: spec.dots },
        tieStart,
        tieStop,
        lyricForPart,
        syllabicForPart,
        accidentalForPart,
        options
      );
    }
    return out;
  }
  function sliceNotesForMeasure(trackNotes, measure) {
    const measureStart = measure.startTick;
    const measureEnd = measure.startTick + measure.lengthTick;
    return trackNotes.map((note) => ({
      note,
      startTick: Math.max(note.tickOn, measureStart),
      endTick: Math.min(note.tickOff, measureEnd)
    })).filter((slice) => slice.endTick > slice.startTick).sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);
  }
  function toClusters(slices) {
    if (slices.length === 0) return [];
    const clusters = [];
    let current = {
      slices: [slices[0]],
      startTick: slices[0].startTick,
      endTick: slices[0].endTick
    };
    for (let i = 1; i < slices.length; i += 1) {
      const slice = slices[i];
      if (slice.startTick === current.startTick) {
        current.slices.push(slice);
        current.endTick = Math.max(current.endTick, slice.endTick);
        continue;
      }
      clusters.push(current);
      current = {
        slices: [slice],
        startTick: slice.startTick,
        endTick: slice.endTick
      };
    }
    clusters.push(current);
    return clusters;
  }
  function assignVoices(clusters) {
    const lanes = [];
    const laneEndTicks = [];
    for (const cluster of clusters) {
      let assigned = -1;
      for (let i = 0; i < lanes.length; i += 1) {
        if (cluster.startTick >= laneEndTicks[i]) {
          assigned = i;
          break;
        }
      }
      if (assigned < 0) {
        assigned = lanes.length;
        lanes.push([]);
        laneEndTicks.push(0);
      }
      lanes[assigned].push(cluster);
      laneEndTicks[assigned] = Math.max(laneEndTicks[assigned], cluster.endTick);
    }
    return lanes;
  }
  function renderVoiceLane(project, clusters, measure, divisions, voiceNumber, keyFifths) {
    const spellingContext = {
      accidentalState: /* @__PURE__ */ new Map(),
      previousKey: null,
      keyFifths
    };
    const measureStart = measure.startTick;
    const measureEnd = measure.startTick + measure.lengthTick;
    let cursor = measureStart;
    let out = "";
    for (const cluster of clusters) {
      if (cluster.startTick > cursor) {
        out += renderRest(cluster.startTick - cursor, voiceNumber, divisions);
      }
      for (let i = 0; i < cluster.slices.length; i += 1) {
        const slice = cluster.slices[i];
        out += renderNoteSegment(project, slice.note, slice.startTick, slice.endTick, divisions, voiceNumber, spellingContext, {
          chord: i > 0,
          lyric: i === 0
        });
      }
      cursor = Math.max(cursor, cluster.endTick);
    }
    if (cursor < measureEnd) {
      out += renderRest(measureEnd - cursor, voiceNumber, divisions);
    }
    return out;
  }
  function renderMeasureNotesWithKey(project, trackNotes, measure, keyFifths) {
    const divisions = project.ppq > 0 ? project.ppq : 480;
    const slices = sliceNotesForMeasure(trackNotes, measure);
    const lanes = assignVoices(toClusters(slices));
    if (lanes.length === 0) {
      return renderRest(measure.lengthTick, 1, divisions);
    }
    if (lanes.length === 1) {
      return renderVoiceLane(project, lanes[0], measure, divisions, 1, keyFifths);
    }
    let out = "";
    for (let i = 0; i < lanes.length; i += 1) {
      out += renderVoiceLane(project, lanes[i], measure, divisions, i + 1, keyFifths);
      if (i < lanes.length - 1) {
        out += `<backup><duration>${measure.lengthTick}</duration></backup>`;
      }
    }
    return out;
  }
  function generateMusicXmlFromProject(project, options) {
    const ppq = project.ppq > 0 ? project.ppq : 480;
    const measureNumberBase = Math.max(0, Math.trunc(project.measurePrefix || 0)) + 1;
    const tempos = normalizeTempos(project.tempos);
    const tsList = sortTimeSignatures(project);
    const tracks = project.tracks.length > 0 ? project.tracks : [
      {
        id: 0,
        name: "Track 1",
        notes: []
      }
    ];
    const maxNoteTick = Math.max(
      0,
      ...tracks.flatMap((track) => track.notes.map((note) => note.tickOff))
    );
    const maxTempoTick = Math.max(0, ...tempos.map((tempo) => tempo.tickPosition));
    const maxTimeSigTick = Math.max(
      0,
      ...tsList.map((ts) => tickAtMeasurePosition(ts.measurePosition, ppq, tsList))
    );
    const maxTick = Math.max(maxNoteTick, maxTempoTick, maxTimeSigTick);
    const measures = buildMeasures(project, maxTick);
    const partList = tracks.map((track, index) => {
      const partId = `P${index + 1}`;
      const partName = escapeXml(normalizeText(track.name || `Track ${index + 1}`));
      return `<score-part id="${partId}"><part-name>${partName}</part-name></score-part>`;
    }).join("");
    const parts = tracks.map((track, index) => {
      const partId = `P${index + 1}`;
      const partTempos = index === 0 ? tempos : [];
      const clef = chooseClef(track);
      const trackKeyFifths = resolveTrackKeyFifths(project, track, index, options);
      const notes = [...track.notes].sort((a, b) => a.tickOn - b.tickOn || a.tickOff - b.tickOff);
      const estimatedByMeasure = options?.estimateKeyFifthsByMeasure ? estimateMeasureKeyFifthsSequence(notes, measures, trackKeyFifths) : null;
      const measuresXml = measures.map((measure, measureIndex) => {
        const keyFifths = resolveMeasureKeyFifths(
          project,
          index,
          measureIndex,
          trackKeyFifths,
          estimatedByMeasure,
          options
        );
        const previousKeyFifths = measureIndex > 0 ? resolveMeasureKeyFifths(
          project,
          index,
          measureIndex - 1,
          trackKeyFifths,
          estimatedByMeasure,
          options
        ) : keyFifths;
        const hasKeyChange = measureIndex === 0 || keyFifths !== previousKeyFifths;
        const hasTimeSigChange = tsList.some((ts) => ts.measurePosition === measure.index);
        const needsAttributes = measure.index === 0 || hasTimeSigChange || hasKeyChange;
        return `<measure number="${measureNumberBase + measure.index}">${needsAttributes ? renderAttributes(measure, ppq, clef, keyFifths) : ""}${renderTempoDirections(measure, partTempos)}${renderMeasureNotesWithKey(project, notes, measure, keyFifths)}</measure>`;
      }).join("");
      return `<part id="${partId}">${measuresXml}</part>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list>${partList}</part-list>${parts}</score-partwise>`;
  }

  // src/musicxml/MikuscoreMusicXmlAdapter.ts
  function getGlobalHooks() {
    const g = globalThis;
    const fromDirect = g.__utaformatix3TsPlusMikuscoreHooks;
    if (fromDirect && typeof fromDirect === "object") {
      return fromDirect;
    }
    const mks = g.mikuscore;
    if (mks && typeof mks === "object") {
      return mks;
    }
    return {};
  }
  function hasXmlDomRuntime() {
    return typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined";
  }
  function parseMusicXmlDocument(xml) {
    if (!hasXmlDomRuntime()) return null;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.querySelector("parsererror") ? null : doc;
  }
  function serializeMusicXmlDocument(doc) {
    return new XMLSerializer().serializeToString(doc);
  }
  function prettyPrintMusicXmlText(xml) {
    const compact = String(xml || "").replace(/>\s+</g, "><").trim();
    const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
    let indent = 0;
    const lines = [];
    for (const rawToken of split) {
      const token = rawToken.trim();
      if (!token) continue;
      if (/^<\//.test(token)) indent = Math.max(0, indent - 1);
      lines.push(`${" ".repeat(indent)}${token}`);
      const isOpening = /^<[^!?/][^>]*>$/.test(token);
      const isSelfClosing = /\/>$/.test(token);
      if (isOpening && !isSelfClosing) indent += 1;
    }
    return lines.join("\n");
  }
  function normalizeForOutput(xml) {
    const hooks = getGlobalHooks();
    if (typeof hooks.normalizeImportedMusicXmlText === "function") {
      try {
        return hooks.normalizeImportedMusicXmlText(xml);
      } catch {
        return String(xml ?? "");
      }
    }
    if (!hasXmlDomRuntime()) {
      return String(xml ?? "");
    }
    const normalized = String(xml ?? "");
    const doc = parseMusicXmlDocument(normalized);
    if (!doc) {
      return normalized;
    }
    return prettyPrintMusicXmlText(serializeMusicXmlDocument(doc));
  }
  var MikuscoreMusicXmlAdapter = class {
    write(project, options) {
      const mode = options?.mode ?? "generate";
      const xml = mode === "preserve" ? Vr(project, { mode }) : generateMusicXmlFromProject(project, options);
      return this.normalize(xml);
    }
    parse(xml, options) {
      const normalized = this.normalize(xml);
      return wr(normalized, {
        defaultLyric: options?.defaultLyric
      });
    }
    normalize(xml) {
      return normalizeForOutput(xml);
    }
  };

  // src/musicxml/index.ts
  var activeMusicXmlAdapter = new MikuscoreMusicXmlAdapter();
  function getMusicXmlAdapter() {
    return activeMusicXmlAdapter;
  }
  function setMusicXmlAdapter(adapter) {
    activeMusicXmlAdapter = adapter;
  }

  // src/converters/vsqxToMusicXml.ts
  function ticksPerMeasure2(ppq, ts) {
    return Math.round(ppq * 4 * ts.numerator / ts.denominator);
  }
  function sortTimeSignatures2(project) {
    const sorted = [...project.timeSignatures].filter((ts) => ts.numerator > 0 && ts.denominator > 0).sort((a, b) => a.measurePosition - b.measurePosition);
    if (sorted.length === 0 || sorted[0].measurePosition !== 0) {
      sorted.unshift({ measurePosition: 0, numerator: 4, denominator: 4 });
    }
    return sorted;
  }
  function getMeasureTimeSignature2(index, list) {
    let active = list[0];
    for (const ts of list) {
      if (ts.measurePosition <= index) active = ts;
      else break;
    }
    return active;
  }
  function buildMeasures2(project, maxTick) {
    const ppq = project.ppq > 0 ? project.ppq : 480;
    const tsList = sortTimeSignatures2(project);
    const measures = [];
    let startTick = 0;
    let index = 0;
    const hardLimit = 1e4;
    while (startTick <= maxTick && index < hardLimit) {
      const ts = getMeasureTimeSignature2(index, tsList);
      const lengthTick = Math.max(1, ticksPerMeasure2(ppq, ts));
      measures.push({ index, startTick, lengthTick });
      startTick += lengthTick;
      index += 1;
    }
    if (measures.length === 0) {
      measures.push({ index: 0, startTick: 0, lengthTick: Math.max(1, ticksPerMeasure2(ppq, tsList[0])) });
    }
    return measures;
  }
  function estimateTrackKeyFifthsByMeasure(trackNotes, measures, trackFifths) {
    return estimateMeasureKeyFifthsSequence(trackNotes, measures, trackFifths);
  }
  function enrichProjectWithEstimatedMusicXmlKeyFifths(project) {
    const maxNoteTick = Math.max(0, ...project.tracks.flatMap((track) => track.notes.map((note) => note.tickOff)));
    const measures = buildMeasures2(project, maxNoteTick);
    const keyFifthsByTrack = project.tracks.map((track) => estimateTrackKeyFifths(track.notes));
    const keyFifthsByMeasure = project.tracks.map(
      (track, index) => estimateTrackKeyFifthsByMeasure(track.notes, measures, keyFifthsByTrack[index] ?? 0)
    );
    const extrasBase = project.extras && typeof project.extras === "object" ? project.extras : {};
    const extrasRecord = extrasBase;
    const musicxmlBase = extrasRecord.musicxml && typeof extrasRecord.musicxml === "object" ? extrasRecord.musicxml : {};
    return {
      ...project,
      extras: {
        ...extrasRecord,
        musicxml: {
          ...musicxmlBase,
          keyFifthsByTrack,
          keyFifthsByMeasure,
          keyFifthsSource: "estimated-from-vsqx-notes"
        }
      }
    };
  }
  function collectProjectWarnings(project) {
    const issues = [];
    for (const warning of project.importWarnings ?? []) {
      issues.push({
        level: "warning",
        code: "VSQX_IMPORT_WARNING",
        message: formatImportWarningMessage(warning)
      });
    }
    if (project.tracks.length === 0) {
      issues.push({
        level: "warning",
        code: "PROJECT_HAS_NO_TRACKS",
        message: "Project has no tracks. A fallback empty part will be generated."
      });
    }
    for (const [index, track] of project.tracks.entries()) {
      if (track.notes.length === 0) {
        issues.push({
          level: "warning",
          code: "TRACK_HAS_NO_NOTES",
          message: `Track[${index}] has no notes.`
        });
      }
    }
    if (project.tempos.length === 0) {
      issues.push({
        level: "warning",
        code: "PROJECT_HAS_NO_TEMPOS",
        message: "Project has no tempos. A default tempo stream may be assumed by downstream tools."
      });
    }
    if (project.timeSignatures.length === 0) {
      issues.push({
        level: "warning",
        code: "PROJECT_HAS_NO_TIMESIGNATURES",
        message: "Project has no time signatures. 4/4 fallback will be used."
      });
    }
    return issues;
  }
  function formatImportWarningMessage(warning) {
    switch (warning.kind) {
      case "TempoNotFound":
        return "Tempo not found in VSQX. Default tempo was applied by parser.";
      case "TempoIgnoredInFile":
        return `Tempo in file '${warning.fileName}' was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
      case "TempoIgnoredInTrack":
        return `Tempo in track '${warning.track.name}' was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
      case "TempoIgnoredInPreMeasure":
        return `Tempo in pre-measure was ignored: tick=${warning.tempo.tickPosition}, bpm=${warning.tempo.bpm}`;
      case "DefaultTempoFixed":
        return `Invalid default tempo was fixed by parser: originalBpm=${warning.originalBpm}`;
      case "TimeSignatureNotFound":
        return "Time signature not found in VSQX. Default 4/4 was applied by parser.";
      case "TimeSignatureIgnoredInTrack":
        return `Time signature in track '${warning.track.name}' was ignored: measure=${warning.timeSignature.measurePosition}, ${warning.timeSignature.numerator}/${warning.timeSignature.denominator}`;
      case "TimeSignatureIgnoredInPreMeasure":
        return `Time signature in pre-measure was ignored: measure=${warning.timeSignature.measurePosition}, ${warning.timeSignature.numerator}/${warning.timeSignature.denominator}`;
      case "IncompatibleFormatSerializationVersion":
        return `Incompatible serialization version: data=${warning.dataVersion}, expected=${warning.currentVersion}`;
      default:
        return `VSQX import warning: ${warning.kind ?? "Unknown"}`;
    }
  }
  function convertVsqxToMusicXmlWithReport(vsqxText, options) {
    const issues = [];
    let parsed;
    try {
      parsed = Er(vsqxText, {
        defaultLyric: options?.defaultLyric ?? "\u3042"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        level: "error",
        code: "VSQX_PARSE_FAILED",
        message
      });
      return { musicXml: null, issues };
    }
    issues.push(...collectProjectWarnings(parsed));
    const project = enrichProjectWithEstimatedMusicXmlKeyFifths(parsed);
    try {
      const musicXml = getMusicXmlAdapter().write(project, options?.musicXml);
      return { musicXml, issues };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        level: "error",
        code: "MUSICXML_WRITE_FAILED",
        message
      });
      return { musicXml: null, issues };
    }
  }
  function convertVsqxToMusicXml(vsqxText, options) {
    const report = convertVsqxToMusicXmlWithReport(vsqxText, options);
    if (report.musicXml != null) return report.musicXml;
    const firstError = report.issues.find((issue) => issue.level === "error");
    throw new Error(firstError?.message ?? "VSQX to MusicXML conversion failed.");
  }

  // src/converters/musicXmlToVsqx.ts
  function convertMusicXmlToVsqx(musicXmlText, options) {
    const project = getMusicXmlAdapter().parse(musicXmlText, options?.musicXml);
    return _r(project).content;
  }
  return __toCommonJS(index_exports);
})();
