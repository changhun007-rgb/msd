// 브라우저 종단 테스트 (모바일 화면):  node test/e2e.js [스크린샷 저장 폴더]
// 실제 Index.html 을 띄우고, 서버는 Code.gs 를 Google 서비스 모형(gas-mock.js) 위에서 실행합니다.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createEnv } = require('./gas-mock');

const outDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'jjak-e2e-'));
fs.mkdirSync(outDir, { recursive: true });
const env = createEnv();
const ctl = { failPhotos: false, calls: [] };
const html = fs.readFileSync(path.join(__dirname, '../apps-script/Index.html'), 'utf8').replace("var ENDPOINT = '';", "var ENDPOINT = '/api';");
assert.ok(html.includes("var ENDPOINT = '/api';"));

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const r = JSON.parse(body);
      ctl.calls.push(r.action);
      if (ctl.failPhotos && r.action === 'photo') { res.writeHead(500); res.end('boom'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(env.api(r)));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

const col = (row, header) => row[env.run('COL')[header] - 1];
const err = (page) => page.locator('#stepError').innerText();
let n = 0;
const ok = (name) => { n++; console.log('  ✓ ' + name); };

async function makeImages(browser) {
  const files = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  for (let i = 0; i < 6; i++) {
    await page.setContent('<body style="margin:0;height:100vh;background:linear-gradient(' + i * 60 + 'deg,hsl(' + i * 55 + ',70%,60%),#fff);font:200px sans-serif;display:grid;place-items:center">' + (i + 1) + '</body>');
    const type = i === 1 ? 'png' : 'jpeg'; // PNG 1장 포함(3200x2400) → 브라우저에서 JPEG 로 변환·축소되는지 확인
    const f = path.join(outDir, 'photo' + (i + 1) + '.' + (type === 'png' ? 'png' : 'jpg'));
    await page.screenshot({ path: f, type });
    files.push(f);
  }
  const gif = path.join(outDir, 'bad.gif');
  fs.writeFileSync(gif, Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64'));
  await page.close();
  return { files, gif };
}

async function fillSteps(page, over) {
  const v = Object.assign({ name: 'Nguyễn Thị Mai', dob: '1998-05-20', phone: '0912 345 678' }, over || {});
  await page.fill('#name', v.name);
  await page.fill('#dob', v.dob);
  await page.fill('#phone', v.phone);
  await page.fill('#height', '160');
  await page.fill('#weight', '50');
  await page.selectOption('#education', 'Đại học');
  await page.selectOption('#marital', 'Đã ly hôn');
  await page.fill('#children', 'Có, 1 bé gái');
  await page.click('#next');
  await page.fill('#occupation', 'Nhân viên văn phòng');
  await page.fill('#hometown', 'Đà Nẵng');
  await page.fill('#residence', 'TP. Hồ Chí Minh');
  await page.selectOption('#tattoo', 'Không');
  await page.fill('#zalo', '0912345678');
  await page.fill('#fatherAge', '58');
  await page.fill('#siblings', '1 chị gái, 1 em trai');
  await page.click('#next');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const { files, gif } = await makeImages(browser);
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'vi-VN' };
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  await page.goto(url);

  // ── 1단계 검증 메시지 ──
  await page.click('#next');
  assert.strictEqual(await err(page), 'Vui lòng nhập họ và tên của bạn.');
  assert.ok(await page.locator('#step0, .step.active').first().isVisible());
  await page.fill('#name', 'Nguyễn Thị Mai');
  await page.click('#next');
  assert.strictEqual(await err(page), 'Vui lòng chọn ngày tháng năm sinh.');
  const y = new Date().getFullYear() - 16;
  await page.fill('#dob', y + '-01-01');
  await page.click('#next');
  assert.strictEqual(await err(page), 'Bạn cần đủ 18 tuổi trở lên để đăng ký.');
  await page.fill('#dob', '1998-05-20');
  await page.fill('#phone', '12345');
  await page.click('#next');
  assert.match(await err(page), /Số điện thoại không hợp lệ/);
  assert.strictEqual(await page.locator('#stepNum').innerText(), '01 / 03');
  await page.screenshot({ path: path.join(outDir, 'shot-mobile-step1-error.png') });
  ok('1단계: 필수값·미성년·전화번호 오류를 베트남어로 안내, 다음 단계로 넘어가지 않음');

  await page.reload();
  await fillSteps(page);
  assert.strictEqual(await page.locator('#stepNum').innerText(), '03 / 03');
  await page.click('#prev');
  assert.strictEqual(await page.locator('#stepNum').innerText(), '02 / 03');
  assert.strictEqual(await page.inputValue('#occupation'), 'Nhân viên văn phòng');
  await page.click('#next');
  ok('단계 이동(이전/다음) 및 입력값 유지');

  // ── 사진 선택 ──
  await page.click('#submit');
  assert.match(await err(page), /Vui lòng chọn đủ 5 ảnh/);
  await page.setInputFiles('#photos', gif);
  assert.strictEqual(await err(page), 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
  await page.setInputFiles('#photos', files.slice(0, 3));
  assert.strictEqual(await page.locator('#uploadCount').innerText(), 'Đã chọn 3/5 ảnh');
  await page.setInputFiles('#photos', files.slice(3, 6)); // 3장 더 → 5장까지만
  assert.strictEqual(await page.locator('#preview img').count(), 5);
  assert.match(await err(page), /Chỉ cần 5 ảnh/);
  await page.locator('#preview .thumb button').nth(1).click(); // 삭제
  assert.strictEqual(await page.locator('#uploadCount').innerText(), 'Đã chọn 4/5 ảnh');
  await page.click('#submit');
  assert.match(await err(page), /Hiện có 4\/5/);
  await page.setInputFiles('#photos', files[1]); // 다시 선택
  assert.strictEqual(await page.locator('#preview img').count(), 5);
  ok('사진: 형식 검증, 나눠서 추가, 5장 제한, 미리보기, 삭제 후 재선택');

  // ── 동의 ──
  await page.click('#submit');
  assert.strictEqual(await err(page), 'Vui lòng đánh dấu đồng ý vào cả hai ô để tiếp tục.');
  await page.check('#consentPersonal');
  await page.click('#submit');
  assert.strictEqual(await err(page), 'Vui lòng đánh dấu đồng ý vào cả hai ô để tiếp tục.');
  await page.check('#consentTransfer');
  assert.strictEqual(ctl.calls.length, 0, '동의 전에는 서버로 아무것도 보내지 않음');
  assert.strictEqual(await page.getAttribute('.consent a', 'href'), 'https://jjak1.com/?mode=privacy');
  await page.locator('.privacytext').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'shot-mobile-step3.png') });
  ok('개인정보 동의 2개 모두 체크해야 제출 가능, 처리방침 링크 연결');

  // ── 저장 실패 → 오류 표시 → 재시도 ──
  ctl.failPhotos = true;
  await page.click('#submit');
  await page.waitForFunction(() => document.getElementById('submit').disabled);
  assert.strictEqual(await page.locator('#submit').innerText(), 'Đang gửi hồ sơ...');
  await page.waitForSelector('#sendStatus:not(.hidden)');
  await page.screenshot({ path: path.join(outDir, 'shot-mobile-sending.png') });
  await page.waitForFunction(() => !document.getElementById('submit').disabled, null, { timeout: 30000 });
  assert.match(await err(page), /Kết nối không ổn định.*gửi lại/s);
  assert.ok(!(await page.locator('#success').isVisible()), '실패 시 완료 화면이 나오면 안 됨');
  assert.strictEqual(col(env.mainRows()[1], '진행상태'), '사진 업로드 중');
  await page.locator('#stepError').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'shot-mobile-failure.png') });
  ok('저장 실패: 오류 메시지 표시, 완료 화면 미표시, 시트에는 "사진 업로드 중"으로 남음');

  ctl.failPhotos = false;
  ctl.calls.length = 0;
  await page.locator('#submit').dblclick(); // 중복 클릭
  await page.waitForSelector('#success', { state: 'visible', timeout: 30000 });
  const receipt = (await page.locator('#receipt').innerText()).replace('Mã hồ sơ: ', '');
  let rows = env.mainRows();
  assert.strictEqual(rows.length, 2, '재시도·중복 클릭에도 행은 1개');
  assert.deepStrictEqual(ctl.calls.filter((a) => a !== 'photo'), ['finish'], '재시도 때 begin 을 다시 보내지 않음');
  assert.strictEqual(col(rows[1], '접수ID'), receipt);
  assert.strictEqual(col(rows[1], '진행상태'), '신규 접수');
  assert.strictEqual(col(rows[1], '이름'), 'Nguyễn Thị Mai');
  assert.strictEqual(col(rows[1], '휴대전화'), '0912345678');
  assert.strictEqual(col(rows[1], '혼인 이력'), 'Đã ly hôn (이혼)');
  assert.strictEqual(col(rows[1], '자녀'), 'Có, 1 bé gái');
  const folder = env.state.folders.get(col(rows[1], '폴더ID'));
  const saved = folder.files.filter((f) => !f.trashed);
  assert.strictEqual(saved.length, 5);
  saved.forEach((f, i) => {
    const buf = Buffer.from(Uint8Array.from(f.bytes.map((b) => b & 255)));
    assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'JPEG 로 저장');
    assert.ok(buf.length < 3 * 1024 * 1024);
    fs.writeFileSync(path.join(outDir, 'saved-' + f.name), buf);
  });
  await page.screenshot({ path: path.join(outDir, 'shot-mobile-success.png') });
  ok('재시도 성공: 완료 화면 + 접수번호, 시트 1행, 사진 5장(JPEG) 저장 — ' + receipt);

  // ── 저장된 사진 크기(긴 변 1500px 이하) ──
  const dims = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    return [img.width, img.height];
  }, Buffer.from(Uint8Array.from(saved[1].bytes.map((b) => b & 255))).toString('base64'));
  assert.deepStrictEqual(dims, [1500, 1125]);
  ok('3200x2400 원본이 1500x1125 로 축소되어 저장');

  // ── 중복 제출 ──
  const page2 = await ctx.newPage();
  await page2.goto(url);
  await fillSteps(page2, { name: 'Mai Nguyen' });
  await page2.setInputFiles('#photos', files.slice(0, 5));
  await page2.check('#consentPersonal');
  await page2.check('#consentTransfer');
  await page2.click('#submit');
  await page2.waitForSelector('#success', { state: 'visible', timeout: 30000 });
  rows = env.mainRows();
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(col(rows[1], '이름'), 'Nguyễn Thị Mai', '기존 행은 그대로');
  assert.ok(col(rows[2], '중복 여부').includes(receipt));
  ok('같은 전화번호로 재제출: 새 행으로 저장 + "' + col(rows[2], '중복 여부') + '"');

  // ── 서버 측 검증 오류가 해당 입력란으로 안내되는지 ──
  const page3 = await ctx.newPage();
  await page3.goto(url);
  await fillSteps(page3, { phone: '0933111222', name: 'Trần Thị Hoa', dob: '1996-03-03' });
  await page3.setInputFiles('#photos', files.slice(0, 5));
  await page3.check('#consentPersonal');
  await page3.check('#consentTransfer');
  await page3.route('**/api', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'rate', message: 'Bạn đã gửi quá nhiều lần. Vui lòng thử lại sau hoặc liên hệ JJAK.' }) }));
  await page3.click('#submit');
  await page3.waitForFunction(() => document.getElementById('stepError').textContent.length > 0);
  assert.match(await err(page3), /Bạn đã gửi quá nhiều lần/);
  assert.ok(!(await page3.locator('#success').isVisible()));
  ok('서버가 거절한 경우(반복 제출 제한 등) 메시지 표시');

  // ── 모바일 레이아웃: 가로 스크롤 없음 ──
  for (const w of [320, 360, 390, 430]) {
    const p = await browser.newPage({ viewport: { width: w, height: 760 }, isMobile: true });
    await p.goto(url);
    for (let s = 0; s < 3; s++) {
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, w + 'px 화면 ' + (s + 1) + '단계에서 가로 넘침 ' + over);
      if (s === 0) await fillSteps(p); // 3단계까지 이동
      if (s === 0) { await p.click('#prev'); }
      if (s === 1) { await p.click('#next'); }
    }
    await p.close();
  }
  ok('모바일 폭 320~430px 에서 가로 넘침 없음');

  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(url);
  await desk.screenshot({ path: path.join(outDir, 'shot-desktop-step1.png') });
  const first = await browser.newPage(mobile);
  await first.goto(url);
  await first.screenshot({ path: path.join(outDir, 'shot-mobile-step1.png'), fullPage: true });

  assert.deepStrictEqual(jsErrors, []);
  await browser.close();
  server.close();
  console.log('\n브라우저 테스트 ' + n + '개 통과 · 산출물: ' + outDir);
})().catch((e) => { console.error(e); process.exit(1); });
