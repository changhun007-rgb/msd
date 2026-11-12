// 서버 로직(Code.gs) 테스트:  node test/server.test.js
const assert = require('assert');
const { createEnv } = require('./gas-mock');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2000, 7)]).toString('base64');
const good = (over) => ({
  action: 'begin', consentPersonal: true, consentTransfer: true, website: '',
  fields: Object.assign({
    name: 'Nguyễn Thị Mai', dob: '1998-05-20', phone: '0912 345 678', height: '160', weight: '50',
    education: 'Đại học', marital: 'Chưa từng kết hôn', children: '', occupation: 'Nhân viên văn phòng',
    hometown: 'Đà Nẵng', residence: 'TP. Hồ Chí Minh', tattoo: 'Không', zalo: '', fatherAge: '55', motherAge: '', siblings: '1 chị gái',
  }, over || {}),
});
const col = (env, row, header) => row[env.run('COL')[header] - 1];
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

function submitAll(env, req) {
  const b = env.api(req || good());
  assert.strictEqual(b.ok, true, JSON.stringify(b));
  for (let i = 0; i < 5; i++) assert.strictEqual(env.api({ action: 'photo', token: b.token, index: i, data: JPEG }).ok, true);
  const f = env.api({ action: 'finish', token: b.token });
  assert.strictEqual(f.ok, true);
  return Object.assign(b, f);
}

test('정상 제출: 시트 1행 + 폴더 + 사진 5장 + 폴더 링크', () => {
  const env = createEnv();
  const r = submitAll(env);
  assert.match(r.receiptId, /^JJ-\d{6}-[A-Z2-9]{4}$/);
  const rows = env.mainRows();
  assert.strictEqual(rows.length, 2);
  const row = rows[1];
  assert.strictEqual(col(env, row, '접수ID'), r.receiptId);
  assert.strictEqual(col(env, row, '진행상태'), '신규 접수');
  assert.strictEqual(col(env, row, '휴대전화'), '0912345678', '앞자리 0 이 보존되어야 함');
  assert.strictEqual(col(env, row, '학력'), 'Đại học (대졸)');
  assert.strictEqual(col(env, row, '사진 수'), '5');
  assert.match(col(env, row, '접수일시(KST)'), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.match(col(env, row, '개인정보 동의'), /^동의 /);
  assert.match(col(env, row, '보관 만료일'), /^\d{4}-\d\d-\d\d$/);
  const folder = env.state.folders.get(col(env, row, '폴더ID'));
  assert.ok(folder.parent, '고객 폴더는 루트 폴더 아래에 생성');
  assert.deepStrictEqual(folder.parent.sharing, ['PRIVATE', 'NONE'], '루트 폴더는 비공개');
  assert.strictEqual(folder.files.filter((f) => !f.trashed).length, 5);
  const link = env.mainSheet().links['2:' + env.run('COL')['사진 폴더']];
  assert.strictEqual(link, 'https://drive.google.com/drive/folders/' + folder.id);
});

test('사진 업로드 전에는 "사진 업로드 중", 5장 미만이면 완료 불가', () => {
  const env = createEnv();
  const b = env.api(good());
  assert.strictEqual(col(env, env.mainRows()[1], '진행상태'), '사진 업로드 중');
  for (let i = 0; i < 3; i++) env.api({ action: 'photo', token: b.token, index: i, data: JPEG });
  const f = env.api({ action: 'finish', token: b.token });
  assert.strictEqual(f.ok, false);
  assert.deepStrictEqual(Array.from(f.missing), [3, 4]);
  assert.strictEqual(col(env, env.mainRows()[1], '진행상태'), '사진 업로드 중');
});

test('같은 번호 사진 재업로드는 교체, 완료 후 추가 업로드 차단, finish 는 멱등', () => {
  const env = createEnv();
  const b = env.api(good());
  for (let i = 0; i < 5; i++) env.api({ action: 'photo', token: b.token, index: i, data: JPEG });
  env.api({ action: 'photo', token: b.token, index: 0, data: JPEG });
  const folder = env.state.folders.get(col(env, env.mainRows()[1], '폴더ID'));
  assert.strictEqual(folder.files.filter((f) => !f.trashed).length, 5);
  assert.strictEqual(env.api({ action: 'finish', token: b.token }).ok, true);
  assert.strictEqual(env.api({ action: 'finish', token: b.token }).ok, true);
  assert.strictEqual(env.api({ action: 'photo', token: b.token, index: 0, data: JPEG }).code, 'done');
});

test('중복 제출: 덮어쓰지 않고 새 행에 중복 표시', () => {
  const env = createEnv();
  const a = submitAll(env);
  const b = submitAll(env, good({ phone: '+84912345678', name: 'Mai Nguyen' }));
  const c = submitAll(env, good({ phone: '0987654321' })); // 전화번호는 다르지만 이름+생년월일 동일
  const d = submitAll(env, good({ phone: '0977000111', name: 'Trần Thị Hoa', dob: '1995-01-01' }));
  const rows = env.mainRows();
  assert.strictEqual(rows.length, 5);
  assert.strictEqual(col(env, rows[1], '중복 여부'), '');
  assert.ok(col(env, rows[2], '중복 여부').includes(a.receiptId + '(연락처)'));
  assert.ok(col(env, rows[3], '중복 여부').includes(a.receiptId + '(이름·생년월일)'));
  assert.strictEqual(col(env, rows[4], '중복 여부'), '');
  assert.ok(b.receiptId && c.receiptId && d.receiptId);
});

test('입력값 검증', () => {
  const env = createEnv();
  const bad = (over, field, code) => {
    const r = env.api(good(over));
    assert.strictEqual(r.ok, false, JSON.stringify(over));
    assert.strictEqual(r.code, code || 'field');
    if (field) assert.strictEqual(r.field, field);
    assert.ok(r.message && /[àáạảãâăđêôơưỉ]/i.test(r.message), '베트남어 메시지');
  };
  bad({ name: ' ' }, 'name');
  bad({ dob: '1998-13-40' }, 'dob');
  bad({ dob: new Date(Date.now() - 17 * 365.25 * 864e5).toISOString().slice(0, 10) }, 'dob', 'age');
  bad({ phone: '12345' }, 'phone');
  bad({ height: '20' }, 'height');
  bad({ weight: 'abc' }, 'weight');
  bad({ education: 'Tiến sĩ giả' }, 'education');
  bad({ marital: '' }, 'marital');
  bad({ occupation: '' }, 'occupation');
  bad({ zalo: 'abc' }, 'zalo');
  bad({ fatherAge: '5' }, 'fatherAge');
  assert.strictEqual(env.mainRows().length, 0, '검증 실패 시 아무것도 기록되면 안 됨');
});

test('동의 누락 · 허니팟 · 잘못된 요청', () => {
  const env = createEnv();
  assert.strictEqual(env.api(Object.assign(good(), { consentTransfer: false })).code, 'consent');
  assert.strictEqual(env.api(Object.assign(good(), { consentPersonal: 'true' })).code, 'consent');
  assert.strictEqual(env.api(Object.assign(good(), { website: 'http://spam' })).code, 'bad_request');
  assert.strictEqual(env.api(null).code, 'bad_request');
  assert.strictEqual(env.api({ action: 'menuPurgeExpired' }).code, 'bad_request');
  assert.strictEqual(env.mainRows().length, 0);
});

test('수식 주입 방지 · 제어문자 제거', () => {
  const env = createEnv();
  submitAll(env, good({ occupation: '=IMPORTXML("http://evil","//a")', siblings: '+1\n=2', hometown: '@SUM(1)' }));
  const row = env.mainRows()[1];
  assert.strictEqual(env.mainSheet().formulas.length, 0, '수식으로 저장된 셀이 없어야 함');
  assert.strictEqual(col(env, row, '직업'), '=IMPORTXML("http://evil","//a")');
  assert.strictEqual(col(env, row, '형제자매'), '+1 =2');
});

test('사진 검증: 형식 · 크기 · 번호 · 토큰', () => {
  const env = createEnv();
  const b = env.api(good());
  const p = (o) => env.api(Object.assign({ action: 'photo', token: b.token, index: 0, data: JPEG }, o));
  assert.strictEqual(p({ data: PNG }).code, 'photo_type');
  assert.strictEqual(p({ data: '<script>' }).code, 'photo_type');
  assert.strictEqual(p({ data: Buffer.alloc(3 * 1024 * 1024 + 10, 1).toString('base64') }).code, 'photo_size');
  assert.strictEqual(p({ data: 'A'.repeat(6 * 1024 * 1024) }).code, 'photo_size');
  assert.strictEqual(p({ index: 5 }).code, 'bad_request');
  assert.strictEqual(p({ index: 1.5 }).code, 'bad_request');
  assert.strictEqual(p({ token: 'JJ-000000-AAAA.9999999999999.forged' }).code, 'expired');
  assert.strictEqual(p({ token: b.token.replace(/^JJ-\d{6}-..../, 'JJ-000000-ZZZZ') }).code, 'expired');
  assert.strictEqual(p({ token: undefined }).code, 'expired');
  const expired = env.run('sign_("' + b.id + '", Date.now() - 1000)');
  assert.strictEqual(p({ token: expired }).code, 'expired');
  assert.strictEqual(p({}).ok, true);
});

test('반복 제출 제한: 같은 번호 6시간 5회, 토큰당 업로드 30회', () => {
  const env = createEnv();
  let last;
  for (let i = 0; i < 5; i++) last = env.api(good());
  assert.strictEqual(last.ok, true);
  assert.strictEqual(env.api(good()).code, 'rate');
  assert.strictEqual(env.api(good({ phone: '0900000001' })).ok, true, '다른 번호는 영향 없음');
  for (let i = 0; i < 30; i++) env.api({ action: 'photo', token: last.token, index: 0, data: JPEG });
  assert.strictEqual(env.api({ action: 'photo', token: last.token, index: 0, data: JPEG }).code, 'rate');
});

test('전체 제출 제한: 10분 40건', () => {
  const env = createEnv();
  for (let i = 0; i < 40; i++) assert.strictEqual(env.api(good({ phone: '09' + String(10000000 + i), name: 'Người ' + i, dob: '1990-01-' + String(1 + (i % 28)).padStart(2, '0') })).ok, true);
  assert.strictEqual(env.api(good({ phone: '0999999999' })).code, 'rate');
});

test('Drive 오류 시 실패 응답 → 같은 토큰으로 재시도 성공', () => {
  const env = createEnv();
  const b = env.api(good());
  env.state.failNext = 'createFile';
  assert.strictEqual(env.api({ action: 'photo', token: b.token, index: 0, data: JPEG }).code, 'server');
  for (let i = 0; i < 5; i++) assert.strictEqual(env.api({ action: 'photo', token: b.token, index: i, data: JPEG }).ok, true);
  assert.strictEqual(env.api({ action: 'finish', token: b.token }).ok, true);
  assert.strictEqual(env.mainRows().length, 2);
});

test('캐시가 비워져도 시트의 폴더ID 로 업로드 계속 가능', () => {
  const env = createEnv();
  const b = env.api(good());
  env.state.cache.clear();
  assert.strictEqual(env.api({ action: 'photo', token: b.token, index: 2, data: JPEG }).ok, true);
});

test('초대 코드: 코드 없는 접근 차단', () => {
  const env = createEnv();
  env.state.props.INVITE_CODE = 'abc123';
  assert.strictEqual(env.api(good()).code, 'invite');
  assert.strictEqual(env.api(Object.assign(good(), { k: 'abc123' })).ok, true);
  assert.ok(env.doGet({}).html, '코드 없으면 안내 페이지');
  assert.strictEqual(env.doGet({ k: 'abc123' }).file, 'Index');
});

test('관리 기능은 웹앱(고객 브라우저)에서 호출 불가', () => {
  const env = createEnv();
  submitAll(env);
  ['menuSetup', 'menuSyncAccess', 'menuShowLink', 'menuRotateInvite', 'menuDeleteSelected', 'menuPurgeExpired', 'onOpen'].forEach((fn) => {
    assert.throws(() => env.run(fn + '()'), /getUi/, fn);
  });
  assert.strictEqual(env.mainRows().length, 2);
  const publicFns = env.run('Object.keys(this).filter(k => typeof this[k] === "function" && !k.endsWith("_"))').sort();
  assert.deepStrictEqual(Array.from(publicFns), ['api', 'doGet', 'doPost', 'menuDeleteSelected', 'menuPurgeExpired', 'menuRotateInvite', 'menuSetup', 'menuShowLink', 'menuSyncAccess', 'onOpen']);
});

console.log('\n서버 테스트 ' + n + '개 통과');
