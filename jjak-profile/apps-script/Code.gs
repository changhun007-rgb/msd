/**
 * JJAK 프로필 접수 — Google Apps Script 서버 코드
 *
 * 고객 브라우저(Index.html)는 api() 한 곳만 호출합니다.
 *   begin  : 입력값 검증 → 시트에 한 행 기록 → 고객별 사진 폴더 생성 → 업로드 토큰 발급
 *   photo  : 사진 1장 저장 (5회 호출)
 *   finish : 사진 5장 확인 후 진행상태를 "신규 접수"로 변경
 *
 * 보안 메모
 * - 이 스크립트는 "배포한 사람(소유자)" 권한으로 실행됩니다. 고객은 시트/드라이브에 직접 접근하지 못합니다.
 * - google.script.run 은 이름이 _ 로 끝나지 않는 모든 함수를 호출할 수 있으므로,
 *   관리 기능(menu*)은 반드시 SpreadsheetApp.getUi() 로 시작합니다(웹앱에서는 예외 발생 → 실행 불가).
 */

// ───────────────────────── 설정 ─────────────────────────
const CFG = {
  SHEET_NAME: '프로필 접수',
  STAFF_SHEET: '담당자',
  LOG_SHEET: '삭제기록',
  ROOT_FOLDER_NAME: 'JJAK 프로필 사진',
  TZ: 'Asia/Seoul',
  PHOTO_COUNT: 5,
  MAX_PHOTO_BYTES: 3 * 1024 * 1024, // 사진 1장 최대 3MB (브라우저에서 미리 압축함)
  TOKEN_TTL_SEC: 60 * 60, // 업로드 토큰 유효시간 1시간
  RETENTION_MONTHS: 12, // 보관기한(개월) — 개인정보처리방침과 일치시켜 주세요
  CONSENT_VERSION: '2026-11-v1', // 동의 문구를 바꾸면 함께 올려 주세요
  RATE: { perPhonePer6h: 5, globalPer10Min: 40, globalPerDay: 300, uploadsPerToken: 30 },
};

const STATUS = { UPLOADING: '사진 업로드 중', NEW: '신규 접수' };
const STATUSES = [STATUS.UPLOADING, STATUS.NEW, '검토 중', '상담 진행', '보류', '완료', '삭제 요청'];

const HEADERS = [
  '접수ID', '접수일시(KST)', '진행상태', '중복 여부', '이름', '생년월일', '나이', '휴대전화', 'Zalo',
  '키(cm)', '몸무게(kg)', '학력', '혼인 이력', '자녀', '직업', '고향', '현재 거주지', '문신',
  '부 나이', '모 나이', '형제자매', '사진 수', '사진 폴더', '개인정보 동의', '국외이전 동의',
  '동의문 버전', '보관 만료일', '담당자 메모', '폴더ID',
];
const COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

const EDU = { 'THPT': '고졸', 'Trung cấp / Cao đẳng': '전문대', 'Đại học': '대졸', 'Sau đại học': '대학원', 'Khác': '기타' };
const MARITAL = { 'Chưa từng kết hôn': '미혼', 'Đã ly hôn': '이혼', 'Góa chồng': '사별' };
const TATTOO = { 'Không': '없음', 'Có': '있음' };

const FIELD_VI = {
  name: 'Họ và tên', dob: 'Ngày tháng năm sinh', phone: 'Số điện thoại', height: 'Chiều cao',
  weight: 'Cân nặng', education: 'Trình độ học vấn', marital: 'Tình trạng hôn nhân',
  occupation: 'Nghề nghiệp', hometown: 'Quê quán', residence: 'Nơi ở hiện tại', zalo: 'Số Zalo',
  fatherAge: 'Tuổi của bố', motherAge: 'Tuổi của mẹ',
};

const MSG = {
  bad_request: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.',
  invite: 'Đường dẫn không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ JJAK để nhận đường dẫn mới.',
  consent: 'Vui lòng đồng ý với cả hai mục về thông tin cá nhân để tiếp tục.',
  age: 'Bạn cần đủ 18 tuổi trở lên để đăng ký.',
  rate: 'Bạn đã gửi quá nhiều lần. Vui lòng thử lại sau hoặc liên hệ JJAK.',
  busy: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.',
  expired: 'Phiên gửi hồ sơ đã hết hạn. Vui lòng bấm gửi lại.',
  done: 'Hồ sơ này đã được gửi xong.',
  photo_type: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.',
  photo_size: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.',
  photos_missing: 'Một số ảnh chưa được tải lên. Vui lòng bấm gửi lại.',
  server: 'Không thể lưu hồ sơ lúc này. Vui lòng thử lại.',
};

// ───────────────────────── 웹앱 진입점 ─────────────────────────
function doGet(e) {
  const invite = prop_('INVITE_CODE');
  const k = String((e && e.parameter && e.parameter.k) || '');
  if (invite && k !== invite) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;font-size:16px;line-height:1.6;padding:28px">' + MSG.invite + '</p>')
      .setTitle('JJAK').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('JJAK | Hoàn thiện hồ sơ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 폼을 다른 곳(자체 도메인 등)에 정적 호스팅할 때 사용하는 JSON 엔드포인트 */
function doPost(e) {
  let req = null;
  try { req = JSON.parse(e.postData.contents); } catch (err) { req = null; }
  return ContentService.createTextOutput(JSON.stringify(api(req)))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 고객 브라우저가 호출하는 유일한 함수 */
function api(req) {
  try {
    if (!req || typeof req !== 'object') return fail_('bad_request');
    if (req.action === 'begin') return begin_(req);
    if (req.action === 'photo') return photo_(req);
    if (req.action === 'finish') return finish_(req);
    return fail_('bad_request');
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    return fail_('server');
  }
}

function fail_(code, field) {
  let message = MSG[code] || MSG.server;
  if (code === 'field') message = 'Vui lòng kiểm tra lại mục: ' + (FIELD_VI[field] || field) + '.';
  const out = { ok: false, code: code, message: message };
  if (field) out.field = field;
  return out;
}

// ───────────────────────── 1) 접수 시작 ─────────────────────────
function begin_(req) {
  if (req.website) return fail_('bad_request'); // 허니팟(봇 차단)
  const invite = prop_('INVITE_CODE');
  if (invite && String(req.k || '') !== invite) return fail_('invite');
  if (req.consentPersonal !== true || req.consentTransfer !== true) return fail_('consent');

  const v = validate_(req.fields);
  if (v.error) return fail_(v.error, v.field);
  const f = v.fields;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('busy');
  try {
    if (!rateOk_(f.phone)) return fail_('rate');

    const sheet = sheet_();
    const now = new Date();
    const id = newId_(now);
    const dup = findDuplicates_(sheet, f);

    const folder = rootFolder_().createFolder(id + ' ' + f.name);
    const expire = new Date(now.getTime());
    expire.setMonth(expire.getMonth() + CFG.RETENTION_MONTHS);

    const row = {};
    row['접수ID'] = id;
    row['접수일시(KST)'] = fmt_(now, 'yyyy-MM-dd HH:mm:ss');
    row['진행상태'] = STATUS.UPLOADING;
    row['중복 여부'] = dup;
    row['이름'] = f.name;
    row['생년월일'] = f.dob;
    row['나이'] = String(f.age);
    row['휴대전화'] = f.phone;
    row['Zalo'] = f.zalo;
    row['키(cm)'] = f.height;
    row['몸무게(kg)'] = f.weight;
    row['학력'] = f.education;
    row['혼인 이력'] = f.marital;
    row['자녀'] = f.children;
    row['직업'] = f.occupation;
    row['고향'] = f.hometown;
    row['현재 거주지'] = f.residence;
    row['문신'] = f.tattoo;
    row['부 나이'] = f.fatherAge;
    row['모 나이'] = f.motherAge;
    row['형제자매'] = f.siblings;
    row['사진 수'] = '0';
    row['사진 폴더'] = '사진 폴더 열기';
    row['개인정보 동의'] = '동의 ' + row['접수일시(KST)'];
    row['국외이전 동의'] = '동의 ' + row['접수일시(KST)'];
    row['동의문 버전'] = CFG.CONSENT_VERSION;
    row['보관 만료일'] = fmt_(expire, 'yyyy-MM-dd');
    row['담당자 메모'] = '';
    row['폴더ID'] = folder.getId();

    const r = sheet.getLastRow() + 1;
    const range = sheet.getRange(r, 1, 1, HEADERS.length);
    range.setNumberFormat('@'); // 전부 텍스트로 저장: 전화번호 앞자리 0 보존 + 수식 실행 방지
    range.setValues([HEADERS.map(function (h) { return safeCell_(row[h]); })]);
    sheet.getRange(r, COL['사진 폴더']).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('사진 폴더 열기').setLinkUrl(folder.getUrl()).build());
    if (dup) sheet.getRange(r, COL['중복 여부']).setBackground('#FDE2E4');

    CacheService.getScriptCache().put('fd_' + id, folder.getId(), CFG.TOKEN_TTL_SEC + 600);
    return { ok: true, id: id, token: sign_(id, now.getTime() + CFG.TOKEN_TTL_SEC * 1000) };
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── 2) 사진 1장 저장 ─────────────────────────
function photo_(req) {
  const t = verify_(req.token);
  if (!t) return fail_('expired');
  const i = Number(req.index);
  if (!(i >= 0 && i < CFG.PHOTO_COUNT) || Math.floor(i) !== i) return fail_('bad_request');
  if (typeof req.data !== 'string' || !req.data) return fail_('photo_type');
  if (req.data.length > CFG.MAX_PHOTO_BYTES * 1.37 + 16) return fail_('photo_size');

  const cache = CacheService.getScriptCache();
  const used = Number(cache.get('up_' + t.id) || 0);
  if (used >= CFG.RATE.uploadsPerToken) return fail_('rate');
  cache.put('up_' + t.id, String(used + 1), CFG.TOKEN_TTL_SEC + 600);

  let bytes;
  try { bytes = Utilities.base64Decode(req.data); } catch (err) { return fail_('photo_type'); }
  if (bytes.length > CFG.MAX_PHOTO_BYTES) return fail_('photo_size');
  // 브라우저에서 항상 JPEG 로 변환해 보내므로, 실제 JPEG 파일인지(매직 바이트) 확인합니다.
  if (bytes.length < 500 || (bytes[0] & 255) !== 0xFF || (bytes[1] & 255) !== 0xD8 || (bytes[2] & 255) !== 0xFF) {
    return fail_('photo_type');
  }

  const folder = folderFor_(t.id);
  if (!folder) return fail_('expired');
  if (folder.getDescription() === 'complete') return fail_('done');

  const name = photoName_(t.id, i);
  trashByName_(folder, name); // 같은 번호 사진을 다시 올리면 교체
  folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', name));
  return { ok: true, index: i };
}

// ───────────────────────── 3) 접수 완료 ─────────────────────────
function finish_(req) {
  const t = verify_(req.token);
  if (!t) return fail_('expired');
  const folder = folderFor_(t.id);
  if (!folder) return fail_('expired');
  if (folder.getDescription() === 'complete') return { ok: true, receiptId: t.id };

  const missing = [];
  for (let i = 0; i < CFG.PHOTO_COUNT; i++) {
    if (!folder.getFilesByName(photoName_(t.id, i)).hasNext()) missing.push(i);
  }
  if (missing.length) {
    const out = fail_('photos_missing');
    out.missing = missing;
    return out;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('busy');
  try {
    const sheet = sheet_();
    const r = findRow_(sheet, t.id);
    if (!r) return fail_('expired');
    sheet.getRange(r, COL['진행상태']).setValue(STATUS.NEW);
    sheet.getRange(r, COL['사진 수']).setValue(String(CFG.PHOTO_COUNT));
    folder.setDescription('complete');
  } finally {
    lock.releaseLock();
  }
  return { ok: true, receiptId: t.id };
}

// ───────────────────────── 입력값 검증 ─────────────────────────
function validate_(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'bad_request' };
  const bad = function (field) { return { error: 'field', field: field }; };
  const f = {};

  f.name = clean_(raw.name, 80);
  if (f.name.length < 2) return bad('name');

  f.dob = clean_(raw.dob, 10);
  const age = age_(f.dob);
  if (age === null || age > 80) return bad('dob');
  if (age < 18) return { error: 'age', field: 'dob' };
  f.age = age;

  f.phone = phone_(raw.phone);
  if (!f.phone) return bad('phone');
  f.zalo = '';
  if (clean_(raw.zalo, 30)) {
    f.zalo = phone_(raw.zalo);
    if (!f.zalo) return bad('zalo');
  }

  f.height = num_(raw.height, 100, 230);
  if (!f.height) return bad('height');
  f.weight = num_(raw.weight, 25, 250);
  if (!f.weight) return bad('weight');

  f.education = choice_(EDU, raw.education);
  if (!f.education) return bad('education');
  f.marital = choice_(MARITAL, raw.marital);
  if (!f.marital) return bad('marital');
  f.tattoo = clean_(raw.tattoo, 20) ? choice_(TATTOO, raw.tattoo) : '';
  if (clean_(raw.tattoo, 20) && !f.tattoo) return bad('tattoo');

  f.children = clean_(raw.children, 200);
  f.occupation = clean_(raw.occupation, 100);
  if (!f.occupation) return bad('occupation');
  f.hometown = clean_(raw.hometown, 100);
  if (!f.hometown) return bad('hometown');
  f.residence = clean_(raw.residence, 100);
  if (!f.residence) return bad('residence');

  f.fatherAge = '';
  if (clean_(raw.fatherAge, 5)) {
    f.fatherAge = num_(raw.fatherAge, 18, 120);
    if (!f.fatherAge) return bad('fatherAge');
  }
  f.motherAge = '';
  if (clean_(raw.motherAge, 5)) {
    f.motherAge = num_(raw.motherAge, 18, 120);
    if (!f.motherAge) return bad('motherAge');
  }
  f.siblings = clean_(raw.siblings, 200);
  return { fields: f };
}

function clean_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 베트남 전화번호를 0xxxxxxxxx 형태로 통일. 형식이 맞지 않으면 '' */
function phone_(v) {
  let s = String(v === null || v === undefined ? '' : v).replace(/[\s.\-()]/g, '');
  if (/^\+?84\d{9,10}$/.test(s)) s = '0' + s.replace(/^\+?84/, '');
  return /^0\d{9,10}$/.test(s) ? s : '';
}

function num_(v, min, max) {
  const s = clean_(v, 8).replace(',', '.');
  if (!/^\d{1,3}(\.\d)?$/.test(s)) return '';
  const n = Number(s);
  return n >= min && n <= max ? String(n) : '';
}

function choice_(map, v) {
  const key = clean_(v, 60);
  return Object.prototype.hasOwnProperty.call(map, key) ? key + ' (' + map[key] + ')' : '';
}

/** 만 나이. 형식 오류면 null */
function age_(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const today = fmt_(new Date(), 'yyyy-MM-dd').split('-').map(Number);
  let age = today[0] - y;
  if (today[1] < mo || (today[1] === mo && today[2] < d)) age--;
  return age >= 0 ? age : null;
}

/** 수식으로 해석될 수 있는 값(=, +, -, @ 시작)은 앞에 ' 를 붙여 텍스트로 고정 */
function safeCell_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ───────────────────────── 중복 확인 · 제출 제한 ─────────────────────────
function findDuplicates_(sheet, f) {
  const last = sheet.getLastRow();
  if (last < 2) return '';
  const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const hits = [];
  const mine = [f.phone, f.zalo].filter(String);
  rows.forEach(function (r) {
    const id = String(r[COL['접수ID'] - 1]);
    if (!id) return;
    const theirs = [phone_(r[COL['휴대전화'] - 1]), phone_(r[COL['Zalo'] - 1])].filter(String);
    const samePhone = mine.some(function (p) { return theirs.indexOf(p) >= 0; });
    const samePerson = String(r[COL['이름'] - 1]).toLowerCase() === f.name.toLowerCase() &&
      String(r[COL['생년월일'] - 1]) === f.dob;
    if (samePhone) hits.push(id + '(연락처)');
    else if (samePerson) hits.push(id + '(이름·생년월일)');
  });
  return hits.length ? '중복 의심: ' + hits.join(', ') : '';
}

function rateOk_(phone) {
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  const pk = 'rp_' + phone;
  const gk = 'rg_' + Math.floor(Date.now() / 600000);
  const p = Number(cache.get(pk) || 0);
  const g = Number(cache.get(gk) || 0);
  const day = fmt_(new Date(), 'yyyyMMdd');
  let d = {};
  try { d = JSON.parse(props.getProperty('DAY_COUNT') || '{}'); } catch (err) { d = {}; }
  const dn = d.day === day ? Number(d.n) || 0 : 0;
  if (p >= CFG.RATE.perPhonePer6h || g >= CFG.RATE.globalPer10Min || dn >= CFG.RATE.globalPerDay) return false;
  cache.put(pk, String(p + 1), 21600);
  cache.put(gk, String(g + 1), 600);
  props.setProperty('DAY_COUNT', JSON.stringify({ day: day, n: dn + 1 }));
  return true;
}

// ───────────────────────── 토큰 (HMAC 서명) ─────────────────────────
function sign_(id, exp) {
  const body = id + '.' + exp;
  return body + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_()));
}

function verify_(token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  if (sign_(parts[0], parts[1]) !== token) return null;
  if (!(Number(parts[1]) > Date.now())) return null;
  return { id: parts[0] };
}

function secret_() {
  let s = prop_('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', s);
  }
  return s;
}

// ───────────────────────── 시트 · 드라이브 도우미 ─────────────────────────
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function fmt_(date, pattern) {
  return Utilities.formatDate(date, CFG.TZ, pattern);
}

function newId_(now) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return 'JJ-' + fmt_(now, 'yyMMdd') + '-' + s;
}

function photoName_(id, i) {
  return id + '_' + (i + 1) + '.jpg';
}

function spreadsheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  const id = prop_('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('JJAK 프로필 접수');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function sheet_() {
  const ss = spreadsheet_();
  return ss.getSheetByName(CFG.SHEET_NAME) || ensureSheets_(ss);
}

/** 필요한 시트 3개를 만들고 머리글·서식을 맞춥니다. 이미 있으면 건드리지 않습니다. */
function ensureSheets_(ss) {
  let main = ss.getSheetByName(CFG.SHEET_NAME);
  if (!main) {
    main = ss.insertSheet(CFG.SHEET_NAME, 0);
    main.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#F3DDDC');
    main.setFrozenRows(1);
    main.setFrozenColumns(5);
    main.getRange(2, COL['진행상태'], main.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build());
    main.hideColumns(COL['폴더ID']);
  }
  if (!ss.getSheetByName(CFG.STAFF_SHEET)) {
    const staff = ss.insertSheet(CFG.STAFF_SHEET);
    staff.getRange(1, 1, 1, 3).setValues([['Google 계정 이메일', '권한', '메모']]).setFontWeight('bold').setBackground('#F3DDDC');
    staff.getRange(2, 3).setValue('권한: 관리자(시트 편집+사진 편집) / 상담원(시트 편집+사진 열람) / 열람(시트·사진 열람만). 입력 후 메뉴 [JJAK 관리 → 담당자 권한 적용]');
    staff.getRange(2, 2, staff.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['관리자', '상담원', '열람'], true).build());
    staff.setFrozenRows(1);
  }
  if (!ss.getSheetByName(CFG.LOG_SHEET)) {
    const log = ss.insertSheet(CFG.LOG_SHEET);
    log.getRange(1, 1, 1, 4).setValues([['접수ID', '삭제일시(KST)', '처리자', '사유']]).setFontWeight('bold').setBackground('#F3DDDC');
    log.setFrozenRows(1);
  }
  return main;
}

function rootFolder_() {
  const id = prop_('ROOT_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* 폴더가 삭제된 경우 새로 만듭니다 */ }
  }
  const folder = DriveApp.createFolder(CFG.ROOT_FOLDER_NAME);
  try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { /* 조직 정책으로 막힌 경우 무시 */ }
  PropertiesService.getScriptProperties().setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function folderFor_(id) {
  const cache = CacheService.getScriptCache();
  let folderId = cache.get('fd_' + id);
  if (!folderId) {
    const sheet = sheet_();
    const r = findRow_(sheet, id);
    if (!r) return null;
    folderId = String(sheet.getRange(r, COL['폴더ID']).getValue());
  }
  try {
    const f = DriveApp.getFolderById(folderId);
    return f.isTrashed() ? null : f;
  } catch (err) {
    return null;
  }
}

function findRow_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

function trashByName_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
}

// ═════════════════════════ 관리 메뉴 (스프레드시트에서만 실행 가능) ═════════════════════════
function onOpen() {
  SpreadsheetApp.getUi().createMenu('JJAK 관리')
    .addItem('① 초기 설정 실행', 'menuSetup')
    .addItem('② 담당자 권한 적용', 'menuSyncAccess')
    .addSeparator()
    .addItem('고객용 링크 · 초대 코드 보기', 'menuShowLink')
    .addItem('초대 코드 새로 만들기 (기존 링크 무효화)', 'menuRotateInvite')
    .addSeparator()
    .addItem('선택한 고객 삭제 (사진 포함)', 'menuDeleteSelected')
    .addItem('보관기한 지난 고객 일괄 삭제', 'menuPurgeExpired')
    .addToUi();
}

function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  const ss = spreadsheet_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  ensureSheets_(ss);
  const folder = rootFolder_();
  secret_();
  if (props.getProperty('INVITE_CODE') === null) props.setProperty('INVITE_CODE', randomCode_());
  try { DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { /* 무시 */ }
  ui.alert('초기 설정 완료',
    '시트 3개(프로필 접수 / 담당자 / 삭제기록)와 사진 폴더가 준비되었습니다.\n\n' +
    '사진 폴더: ' + folder.getUrl() + '\n초대 코드: ' + props.getProperty('INVITE_CODE') + '\n\n' +
    '다음 단계: [배포 → 새 배포 → 웹 앱] 으로 배포한 뒤, [담당자] 시트에 이메일을 넣고 [② 담당자 권한 적용]을 실행하세요.',
    ui.ButtonSet.OK);
}

function menuShowLink() {
  const ui = SpreadsheetApp.getUi();
  const code = prop_('INVITE_CODE');
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (err) { url = ''; }
  if (!/\/exec$/.test(url)) url = '(배포 화면에서 복사한 웹 앱 URL — /exec 로 끝나는 주소)';
  ui.alert('고객용 링크',
    (code ? url + '?k=' + code + '\n\n초대 코드: ' + code + '\n(?k=코드 가 없는 주소로는 접수할 수 없습니다.)'
      : url + '\n\n초대 코드가 꺼져 있어 주소만 알면 누구나 접수할 수 있습니다.'),
    ui.ButtonSet.OK);
}

function menuRotateInvite() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('초대 코드 새로 만들기',
    '새 코드를 만들면 이미 보낸 링크는 더 이상 열리지 않습니다. 계속할까요?', ui.ButtonSet.OK_CANCEL);
  if (res !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('INVITE_CODE', randomCode_());
  menuShowLink();
}

function randomCode_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

/** [담당자] 시트 내용대로 스프레드시트와 사진 폴더의 공유 권한을 맞춥니다(목록에 없는 사람은 제거). */
function menuSyncAccess() {
  const ui = SpreadsheetApp.getUi();
  const ss = spreadsheet_();
  ensureSheets_(ss);
  const staff = ss.getSheetByName(CFG.STAFF_SHEET);
  const last = staff.getLastRow();
  const rows = last > 1 ? staff.getRange(2, 1, last - 1, 2).getValues() : [];
  const sheetWant = {}, folderWant = {}, errors = [];
  rows.forEach(function (r) {
    const email = String(r[0]).trim().toLowerCase();
    const role = String(r[1]).trim();
    if (!email) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || ['관리자', '상담원', '열람'].indexOf(role) < 0) {
      errors.push(email + ' → 이메일 또는 권한 값이 올바르지 않습니다.');
      return;
    }
    sheetWant[email] = role === '열람' ? 'view' : 'edit';
    folderWant[email] = role === '관리자' ? 'edit' : 'view';
  });

  const count = Object.keys(sheetWant).length;
  const res = ui.alert('담당자 권한 적용',
    '담당자 ' + count + '명에게 권한을 부여하고, 목록에 없는 계정의 접근 권한은 제거합니다. 계속할까요?',
    ui.ButtonSet.OK_CANCEL);
  if (res !== ui.Button.OK) return;

  applyAccess_(DriveApp.getFileById(ss.getId()), sheetWant, errors);
  applyAccess_(rootFolder_(), folderWant, errors);
  ui.alert('권한 적용 결과',
    errors.length ? '일부 항목을 처리하지 못했습니다:\n' + errors.join('\n') : '담당자 ' + count + '명의 권한을 적용했습니다.',
    ui.ButtonSet.OK);
}

function applyAccess_(target, want, errors) {
  try { target.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { /* 무시 */ }
  const owner = target.getOwner() ? target.getOwner().getEmail().toLowerCase() : '';
  const current = {};
  target.getEditors().forEach(function (u) { current[u.getEmail().toLowerCase()] = 'edit'; });
  target.getViewers().forEach(function (u) {
    const e = u.getEmail().toLowerCase();
    if (!current[e]) current[e] = 'view';
  });
  Object.keys(current).forEach(function (email) {
    if (!email || email === owner || want[email] === current[email]) return;
    try {
      if (current[email] === 'edit') target.removeEditor(email); else target.removeViewer(email);
    } catch (err) { errors.push(email + ' 제거 실패: ' + err.message); }
  });
  Object.keys(want).forEach(function (email) {
    if (email === owner || want[email] === current[email]) return;
    try {
      if (want[email] === 'edit') target.addEditor(email); else target.addViewer(email);
    } catch (err) { errors.push(email + ' 추가 실패: ' + err.message); }
  });
}

function menuDeleteSelected() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== CFG.SHEET_NAME) {
    ui.alert('[' + CFG.SHEET_NAME + '] 시트에서 삭제할 고객의 행을 선택한 뒤 실행하세요.');
    return;
  }
  const range = sheet.getActiveRange();
  const rows = [];
  for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
    if (r >= 2 && r <= sheet.getLastRow()) rows.push(r);
  }
  deleteRows_(ui, sheet, rows, '선택한');
}

function menuPurgeExpired() {
  const ui = SpreadsheetApp.getUi();
  const sheet = sheet_();
  const last = sheet.getLastRow();
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const rows = [];
  if (last > 1) {
    sheet.getRange(2, COL['보관 만료일'], last - 1, 1).getDisplayValues().forEach(function (v, i) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v[0]) && v[0] < today) rows.push(i + 2);
    });
  }
  deleteRows_(ui, sheet, rows, '보관기한이 지난');
}

function deleteRows_(ui, sheet, rows, label) {
  if (!rows.length) {
    ui.alert('삭제할 고객이 없습니다.');
    return;
  }
  const res = ui.prompt('고객 정보 삭제',
    label + ' 고객 ' + rows.length + '명의 시트 기록과 사진 폴더를 삭제합니다. 되돌릴 수 없습니다.\n' +
    '삭제 사유를 입력하고 확인을 누르세요 (예: 고객 요청, 보관기한 만료).', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const reason = res.getResponseText() || '';
  const ss = sheet.getParent();
  ensureSheets_(ss);
  const log = ss.getSheetByName(CFG.LOG_SHEET);
  const who = Session.getActiveUser().getEmail();
  const now = fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss');
  rows.sort(function (a, b) { return b - a; }).forEach(function (r) {
    const id = String(sheet.getRange(r, COL['접수ID']).getValue());
    const folderId = String(sheet.getRange(r, COL['폴더ID']).getValue());
    if (folderId) {
      try { DriveApp.getFolderById(folderId).setTrashed(true); } catch (err) { /* 이미 삭제됨 */ }
    }
    sheet.deleteRow(r);
    log.appendRow([id, now, who, reason]); // 삭제기록에는 개인정보를 남기지 않습니다
  });
  ui.alert(rows.length + '명의 정보를 삭제했습니다. (사진 폴더는 드라이브 휴지통에서 30일 후 완전히 삭제됩니다)');
}
