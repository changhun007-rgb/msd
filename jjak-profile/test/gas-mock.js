// Google Apps Script 런타임의 간이 모형. Code.gs 를 Node 에서 그대로 실행해 로직을 검증하기 위한 용도입니다.
// 실제 Google 서비스와 100% 같지는 않으므로, 최종 확인은 반드시 실제 배포 환경에서 해야 합니다.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function chain(target) {
  // 서식 관련 메서드 등 모형에 없는 호출은 조용히 자기 자신을 돌려줍니다.
  return new Proxy(target, {
    get(t, k, recv) {
      if (k in t) return Reflect.get(t, k, recv);
      if (typeof k === 'symbol' || k === 'then') return undefined;
      return () => recv;
    },
  });
}

function createEnv() {
  const state = { props: {}, cache: new Map(), sheets: [], folders: new Map(), seq: 0, failNext: null };
  const newId = (p) => p + (++state.seq) + crypto.randomBytes(6).toString('hex');

  // ── Spreadsheet ──
  function makeSheet(name) {
    const sh = { name, cells: [], formats: [], links: {}, formulas: [] };
    const cell = (r, c) => (sh.cells[r - 1] && sh.cells[r - 1][c - 1] !== undefined ? sh.cells[r - 1][c - 1] : '');
    const put = (r, c, v) => {
      while (sh.cells.length < r) sh.cells.push([]);
      const fmt = sh.formats[r - 1] && sh.formats[r - 1][c - 1];
      let val = v;
      if (typeof val === 'string') {
        if (val.startsWith("'")) val = val.slice(1); // 실제 시트: 앞의 ' 는 텍스트 표시
        else if (fmt !== '@' && val.startsWith('=')) { sh.formulas.push([r, c, val]); }
        else if (fmt !== '@' && val !== '' && !isNaN(Number(val))) val = Number(val); // 숫자 자동 변환
      }
      sh.cells[r - 1][c - 1] = val;
    };
    const api = chain({
      getName: () => name,
      getParent: () => ss,
      getLastRow: () => {
        for (let r = sh.cells.length; r > 0; r--) if ((sh.cells[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
        return 0;
      },
      getMaxRows: () => 1000,
      getRange: (r, c, nr = 1, nc = 1) => {
        const range = chain({
          getRow: () => r,
          getNumRows: () => nr,
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
          getDisplayValues: () => range.getValues().map((row) => row.map(String)),
          getValue: () => cell(r, c),
          setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => put(r + i, c + j, v))); return range; },
          setValue: (v) => { put(r, c, v); return range; },
          setNumberFormat: (f) => {
            for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
              sh.formats[r + i - 1] = sh.formats[r + i - 1] || [];
              sh.formats[r + i - 1][c + j - 1] = f;
            }
            return range;
          },
          setRichTextValue: (rt) => { put(r, c, rt.text); sh.links[r + ':' + c] = rt.url; return range; },
        });
        return range;
      },
      deleteRow: (r) => { sh.cells.splice(r - 1, 1); sh.formats.splice(r - 1, 1); },
      appendRow: (row) => { const r = api.getLastRow() + 1; row.forEach((v, j) => put(r, j + 1, v)); },
    });
    sh.api = api;
    return sh;
  }
  const ss = chain({
    getId: () => 'SPREADSHEET1',
    getSheetByName: (n) => { const s = state.sheets.find((x) => x.name === n); return s ? s.api : null; },
    insertSheet: (n) => { const s = makeSheet(n); state.sheets.push(s); return s.api; },
  });

  // ── Drive ──
  function makeFolder(name, parent) {
    const f = { id: newId('fld'), name, parent, files: [], children: [], desc: '', trashed: false, sharing: null };
    f.api = chain({
      getId: () => f.id,
      getName: () => f.name,
      getUrl: () => 'https://drive.google.com/drive/folders/' + f.id,
      isTrashed: () => f.trashed,
      setTrashed: (v) => { f.trashed = v; return f.api; },
      getDescription: () => f.desc,
      setDescription: (d) => { f.desc = d; return f.api; },
      setSharing: (a, p) => { f.sharing = [a, p]; return f.api; },
      createFolder: (n) => { const c = makeFolder(n, f); f.children.push(c); return c.api; },
      createFile: (blob) => {
        if (state.failNext === 'createFile') { state.failNext = null; throw new Error('Drive 일시 오류(모형)'); }
        const file = { id: newId('file'), name: blob.name, type: blob.type, bytes: blob.bytes, trashed: false };
        file.api = { getName: () => file.name, setTrashed: (v) => { file.trashed = v; } };
        f.files.push(file);
        return file.api;
      },
      getFilesByName: (n) => {
        const list = f.files.filter((x) => x.name === n && !x.trashed);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++].api };
      },
    });
    state.folders.set(f.id, f);
    return f;
  }

  const sandbox = {
    console: { error() {}, log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props[k] = String(v); },
        deleteProperty: (k) => { delete state.props[k]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = state.cache.get(k); return e && e.exp > Date.now() ? e.v : null; },
        put: (k, v, ttl) => { state.cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }); },
        remove: (k) => { state.cache.delete(k); },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, pattern) => {
        const p = {};
        new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
          .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
        if (p.hour === '24') p.hour = '00';
        return pattern.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
          .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
      },
      base64Decode: (s) => {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('bad base64');
        return Array.from(new Int8Array(Buffer.from(s, 'base64')));
      },
      base64EncodeWebSafe: (bytes) => Buffer.from(Uint8Array.from(bytes.map((b) => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      computeHmacSha256Signature: (v, k) => Array.from(new Int8Array(crypto.createHmac('sha256', k).update(v).digest())),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
      newRichTextValue: () => { const rt = {}; const b = { setText: (t) => { rt.text = t; return b; }, setLinkUrl: (u) => { rt.url = u; return b; }, build: () => rt }; return b; },
      newDataValidation: () => chain({ build: () => ({}) }),
    },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' },
      Permission: { NONE: 'NONE' },
      createFolder: (n) => makeFolder(n, null).api,
      getFolderById: (id) => { const f = state.folders.get(id); if (!f) throw new Error('not found'); return f.api; },
    },
    HtmlService: {
      createHtmlOutputFromFile: (n) => chain({ file: n }),
      createHtmlOutput: (h) => chain({ html: h }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (t) => chain({ text: t, getContent: () => t }),
    },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    ScriptApp: { getService: () => ({ getUrl: () => '' }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });

  return {
    state,
    run: (expr) => vm.runInContext(expr, sandbox),
    api: (req) => { sandbox.__req = JSON.parse(JSON.stringify(req)); return vm.runInContext('api(__req)', sandbox); },
    doGet: (params) => { sandbox.__e = { parameter: params || {} }; return vm.runInContext('doGet(__e)', sandbox); },
    mainRows: () => { const s = state.sheets.find((x) => x.name === '프로필 접수'); return s ? s.cells : []; },
    mainSheet: () => state.sheets.find((x) => x.name === '프로필 접수'),
  };
}

module.exports = { createEnv };
