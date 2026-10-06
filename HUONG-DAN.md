# Hanami Sushi Bar – hướng dẫn triển khai

Apps Script + GitHub + Vercel + máy in Epson TM-m30III

## Checklist triển khai

| # | Việc | Ai | Xong khi |
|---|---|---|---|
| 0 | Chrome profile riêng + bật Apps Script API | Bạn | — |
| 1 | Push repo lên GitHub | Bạn | `npm test` 15 tester OK |
| 2 | Sheet + Apps Script: `setup`, Skriptegenskaper, Distribuera webbapp | Bạn | Menu **Hanami** xuất hiện |
| 3 | Vercel: env, deploy, Deploy Hook | Bạn | `/api/health` → `"ok": true` |
| 4 | GitHub Actions secrets | Bạn | Action "Apps Script" xanh |
| 5 | Máy in TM-m30III | Bạn + quán | Testbeställning in ra |
| 6 | Tên miền | Bạn + quán | `https://hanamisushibar.se` mở web mới |
| 7 | In QR bàn, cài `/kok` trên iPad, hướng dẫn nhân viên | Quán | Đơn thử từ bàn in ra ở bếp |
| 8 | Chạy thử 1 ngày trước khi quảng bá | Cả hai | Không có lỗi trong tab **Logg** |

### Một hàm serverless duy nhất

Vercel gói Hobby chỉ cho tối đa 12 serverless function mỗi lần deploy. Vì vậy toàn bộ API đi qua **một** file duy nhất `api/index.js`. Mọi địa chỉ `/api/...` được `rewrites` trong `vercel.json` chuyển về file này (`/api/:route*` → `/api/index?route=:route*`), rồi file này chuyển tiếp sang các handler trong `lib/routes/`:

| Đường dẫn | Handler |
|---|---|
| `/api/submit` | `lib/routes/submit.js` – đặt món và đặt bàn |
| `/api/admin` | `lib/routes/admin.js` – màn hình bếp (cần `x-admin-key`) |
| `/api/availability` | `lib/routes/availability.js` – giá và món hết, cache 60 giây |
| `/api/health` | `lib/routes/health.js` – kiểm tra kết nối Google Sheet |
| `/api/print` | `lib/routes/print.js` – cầu nối Raspberry Pi (dự phòng) |
| `/api/sdp/<SDP_KEY>` | `lib/routes/sdp.js` – Epson Server Direct Print |
| `/api/cloudprnt/<KEY>` | `lib/routes/cloudprnt.js` – Star CloudPRNT (dự phòng) |

Thêm đường dẫn mới: viết handler trong `lib/routes/` rồi khai báo trong bảng `ROUTES` (một tầng, ví dụ `/api/x`) hoặc `KEYED` (hai tầng, khoá nằm trong địa chỉ, ví dụ `/api/x/<khoá>`) của `api/index.js`. Số lượng endpoint không còn bị giới hạn.

Lịch sử: bản đầu dùng catch-all `api/[...route].js`. Trên Vercel nó chỉ bắt được địa chỉ một tầng (`/api/submit`) nhưng **không** bắt được hai tầng (`/api/sdp/<khoá>`), máy in nhận trang 404 của Vercel. Vì thế đổi sang `api/index.js` + `rewrites` tường minh. Đừng đổi lại.

Lưu ý: thư mục ảnh đặt tên `static/bilder/` chứ không phải `meny`, vì `/meny` đã là đường dẫn của trang menu; trùng tên sẽ làm trang menu không mở được.

## Biến môi trường Vercel

| Biến | Bắt buộc | Lấy ở đâu |
|---|---|---|
| `GAS_URL` | ✔ | Sheet → Hanami → Visa API-nyckel |
| `GAS_SECRET` | ✔ | như trên |
| `ADMIN_KEY` | ✔ | tự đặt (mật khẩu `/kok`) |
| `SDP_KEY` | ✔ | tự đặt, chữ + số, ≥ 32 ký tự |
| `SDP_ID` | nên có | `hanami-kok` |
| `REQUIRE_SHEET_MENU` | nên có | `1` |

Tạo khoá ngẫu nhiên trên Mac: `openssl rand -hex 24`

### Skriptegenskaper (Apps Script)

| Thuộc tính | Bắt buộc | Giá trị |
|---|---|---|
| `API_SECRET` | ✔ | `setup` tự tạo, không sửa |
| `NOTIFY_EMAIL` | ✔ | mail quán |
| `SITE_URL` | ✔ | `https://hanamisushibar.se` |
| `VERCEL_DEPLOY_HOOK` | ✔ | Vercel → Settings → Git → Deploy Hooks |
| `ELKS_USER`, `ELKS_PASSWORD`, `SMS_FROM` | tuỳ chọn | 46elks.se |

## Kiến trúc

| Tầng | Vai trò | Ai sửa |
|---|---|---|
| **Google Sheet** | Cơ sở dữ liệu: đơn hàng, đặt bàn, **menu**, nhật ký lỗi | Quán |
| **Apps Script** (`apps-script/`) | Kiểm tra món và giá theo Sheet, đánh số đơn, gửi mail/SMS, trigger | Bạn (qua GitHub) |
| **Vercel** (`api/`, `src/`) | Web, kiểm tra giờ mở cửa/định dạng, cổng API giữ kín khoá Apps Script, màn hình bếp, endpoint cho máy in | Bạn (qua GitHub) |
| **Epson TM-m30III** | Tự hỏi web mỗi 5 giây, có đơn là in (Server Direct Print) | Quán (chỉ cắm điện + LAN) |
| **GitHub** | Nguồn duy nhất của code; tự test, tự deploy Apps Script | Bạn |

Nguyên tắc:
- Trình duyệt **không bao giờ** thấy URL hay khoá Apps Script; mọi gọi đi qua `/api/*` trên Vercel.
- **Giá luôn lấy từ Sheet** lúc nhận đơn; giá gửi từ trình duyệt bị bỏ qua.
- Menu được render sẵn thành HTML lúc build (tốt cho Google). "Slut idag" và giá mới cập nhật lên web trong vòng 1 phút, không cần build lại.

Luồng thay đổi:

| Muốn đổi | Làm ở đâu | Lên web khi nào |
|---|---|---|
| Hết món hôm nay | `/kok` → Meny idag, hoặc tick cột *Slut idag* | ≤ 1 phút, tự reset 04:00 |
| Giá món | Sheet → Meny → cột *Pris* | Đơn mới tính giá mới ngay; giá hiển thị cập nhật ≤ 1 phút |
| Thêm/bớt món, đổi tên, mô tả | Sheet → Meny, rồi **Hanami → Publicera webbplatsen** | ~1 phút |
| Giờ mở cửa, ngày nghỉ lễ | `data/settings.js` → push GitHub | ~1 phút |
| Code Apps Script | `apps-script/` → push GitHub | GitHub Action tự deploy |

---

## Giao diện

Cùng bố cục, font và hiệu ứng như Vietfood (QDesign), nhưng bảng màu riêng cho Hanami: **trắng, hồng anh đào, xanh koi**, chữ **vàng gold**.

| Vai trò | Màu | Dùng cho |
|---|---|---|
| Nền | trắng ấm `#FCF9F8`, thẻ trắng `#FFFFFF` | trang, thẻ, form |
| Hồng | dải `#FBEEF2 → #F7E4EA`, hồng đậm `#E48FA8`, hồng nhạt `#F9E3E9` | dải xen kẽ, cành anh đào, viền thẻ, số thứ tự, vòng trăng ở hero |
| Xanh koi | `#1873BC`, xanh đậm `#0F3D6E` | logo, nút phụ, nút +, mục đang chọn, ô nhập khi focus, thanh giỏ hàng, chân trang, tiêu đề lớn ở hero |
| Vàng gold | `#B8923F` / đậm `#9A7732`, nhũ `#7A5E24 → #E5CF98` | mọi tiêu đề, nhãn nhỏ, giá, nút chính (nền vàng, chữ nâu sẫm) |
| Chữ | xanh xám đậm `#1B2A3A`, phụ `#4C5B6B` | nội dung |

Nguyên tắc phối: **vàng = chữ**, **xanh = thao tác** (nút, link, focus), **hồng = bề mặt và trang trí**, trắng làm nền để ba màu không chọi nhau. Chữ vàng dùng tông đậm để đọc được trên nền trắng (độ tương phản đạt WCAG AA); chữ nhũ quét sáng chỉ ở tiêu đề.

| Thành phần | Giá trị |
|---|---|
| Font | **Playfair Display** cho tiêu đề (dòng nhấn in nghiêng), **Jost** cho nội dung, nút, nhãn |
| Nhãn, nút | chữ hoa giãn 0,22em, bo góc 2 px; nút vàng có ánh sáng quét |
| Màn hình chào | Hai con koi (trắng và xanh) bơi vòng âm dương 3,5 giây rồi nhập thành logo, logo bay về chỗ trên trang. **Hiện lại mỗi lần tải trang**, cả trang chủ lẫn trang menu. Bỏ qua khi khách quét QR ở bàn (`?bord=`) và khi thiết bị bật giảm chuyển động. Muốn chỉ chạy ở trang chủ: trong `scripts/build.mjs` đổi `<!--SPLASH-->` thành `path === "/" ? read(...) : ""` |
| Phim món ăn | Nằm trong mục **Boka bord**, dưới phần giới thiệu bên trái form (máy tính) hoặc phía trên form (điện thoại, khung 4:3). Tự phát không tiếng, lặp lại, **chỉ phát khi cuộn tới** (IntersectionObserver) để tiết kiệm pin và dữ liệu; có nút bật tiếng. File `static/intro.mp4` 1,2 MB + ảnh bìa `intro-poster.jpg` |
| Ảnh món ăn | 11 ảnh của quán gắn vào 11 danh mục (`static/bilder/<id>-{s,m,l}.webp/jpg` cho banner 16:7 trên `/meny`, `<id>-sq` vuông cho 6 thẻ nổi bật trang chủ). Mỗi ảnh có ba cỡ, WebP kèm JPG dự phòng, tải lười (lazy) nên trang menu vẫn nhẹ. Thêm ảnh cho danh mục mới: đặt file đúng tên vào `static/bilder/`, build tự nhận, không cần sửa code |
| Hiệu ứng khác | tiêu đề bắn chữ từ phải, thẻ ánh gương hồng, cành anh đào đung đưa, cánh hoa rơi chậm |
| Nút nổi | **Boka & Beställ** (vàng) → hộp ba lựa chọn; trên trang chủ chỉ hiện sau khi cuộn qua hai nút chính |
| Logo | cá koi xanh trong vòng trăng hồng |

Hai trang:
- **`/`** – trang chủ: hero, ưu đãi (lunch/happy hour/student, tự hiện "Gäller nu"), 6 nhóm món nổi bật (giá "från" tính tự động từ menu), cách đặt tại bàn, giờ mở cửa (hôm nay tự sáng), bản đồ chỉ tải khi bấm, form đặt bàn.
- **`/meny`** – menu đầy đủ: tìm kiếm, thanh danh mục dính, giỏ hàng, thanh đặt hàng dưới đáy, chế độ bàn (`/meny?bord=5`). Link cũ `/?bord=5` tự chuyển sang đây.

**Ghi chú và xác nhận**
- Mỗi món trong giỏ có nút **"+ Önskemål för den här rätten"** để ghi yêu cầu riêng (tối đa 120 ký tự), ví dụ "utan avokado". Ghi chú này đi theo món qua Sheet → màn hình bếp → phiếu in, luôn nằm ngay dưới tên món.
- Ngoài ra vẫn có ô **Meddelande till köket** cho yêu cầu chung của cả đơn, chỗ ghi dị ứng.
- Khách điền **e-post** (không bắt buộc) thì nhận mail xác nhận: đơn hàng có đầy đủ món, ghi chú, tổng tiền, giờ lấy; đặt bàn thì nhận bản sao yêu cầu kèm lưu ý bàn chỉ chắc chắn khi quán xác nhận. Cột **Bekräftelse** trong Sheet ghi giờ đã gửi.
- Mail gửi qua tài khoản Google của quán. Gmail thường giới hạn 100 mail/ngày, tính cả mail báo cho quán lẫn mail cho khách, tức khoảng 50 đơn mỗi ngày. Vượt mức thì dùng Google Workspace (1 500/ngày).

Mọi hiệu ứng tắt khi thiết bị bật *giảm chuyển động*. Nội dung vẫn hiện đủ nếu JavaScript lỗi.

Tệp giao diện:

```
src/theme.css          hệ thiết kế dùng chung (màu, chữ, nút, thẻ, form, footer, dialog)
src/common.js          giờ mở cửa, hiệu ứng, nút Boka & Beställ, gửi dữ liệu
src/partials/          header, footer, nút nổi + hộp chọn, màn hình chào (koi), SVG (cành anh đào, icon)
src/index.html         trang chủ (+ CSS và JS riêng)
src/meny.html          trang menu và giỏ hàng (+ CSS và JS riêng)
src/kok.html           màn hình bếp (giao diện sáng, dễ đọc trong bếp)
```

Lúc build, CSS và JS được nhúng thẳng vào từng trang HTML (giống Vietfood: không có file CSS/JS rời để tránh lỗi mất style). Font tải từ Google Fonts.

## 0. Chuẩn bị (tránh lỗi "Det går inte att öppna filen")

Lỗi bạn gặp trước đó do Chrome đăng nhập **nhiều tài khoản Google**. Tạo một **Chrome profile riêng** chỉ đăng nhập tài khoản sẽ sở hữu Sheet (nên là tài khoản của quán hoặc Google Workspace của Queenie89 AB), và làm mọi bước Google trong profile đó.

Bật Apps Script API cho tài khoản này: https://script.google.com/home/usersettings → **Google Apps Script API: På**.

## 1. GitHub

```bash
cd hanami-pro
npm test                       # 14 tester OK
git init && git add . && git commit -m "Hanami: webb + Apps Script"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/hanami-sushibar.git
git push -u origin main
```

## 2. Google Sheet + Apps Script

1. Tạo Google Sheet mới, đặt tên `Hanami – Drift`.
2. **Tillägg → Apps Script**. Đặt tên project `Hanami backend`.
   ⚙️ **Projektinställningar** → copy **Skript-ID**.
3. Đẩy code lên bằng clasp (trên máy bạn):

```bash
npx @google/clasp@2.4.2 login            # mở trình duyệt, chọn đúng tài khoản
cp apps-script/.clasp.json.example apps-script/.clasp.json
# sửa scriptId trong apps-script/.clasp.json
npm run gas:push
```

   > Không muốn dùng clasp: trong Apps Script tạo từng file tên giống thư mục `apps-script/` (Config, Api, Sheets, Orders, Menu, Notify, Setup, MenuSeed), dán nội dung vào. Bật *Visa manifestfilen* trong Projektinställningar và dán `appsscript.json`.

4. Tải lại Apps Script, chọn hàm **setup** → **Kör** → cấp quyền (Avancerat → Gå till Hanami backend → Tillåt).
   Sheet sẽ có 4 tab, menu mẫu 101 món, dropdown trạng thái, màu, trigger, và menu **Hanami** trên thanh công cụ.
5. ⚙️ **Projektinställningar → Skriptegenskaper**, thêm:

| Thuộc tính | Giá trị |
|---|---|
| `NOTIFY_EMAIL` | mail quán nhận đơn (nhiều mail cách nhau dấu phẩy) |
| `SITE_URL` | `https://hanamisushibar.se` |
| `ELKS_USER`, `ELKS_PASSWORD` | từ 46elks.se (bỏ trống = không gửi SMS) |
| `SMS_FROM` | `Hanami` |
| `VERCEL_DEPLOY_HOOK` | điền ở bước 3 |

   `API_SECRET` đã được `setup` tự tạo, **không sửa**.

6. **Distribuera → Ny distribution** → ⚙️ **Webbapp**
   - Beskrivning: `prod`
   - Kör som: **Jag**
   - Vem har åtkomst: **Alla**
   → **Distribuera**. Copy **Distributions-ID** và **Webbapp-URL**.

7. Trong Sheet: **Hanami → Visa API-nyckel för Vercel** → copy `GAS_URL` và `GAS_SECRET`.

## 3. Vercel

1. **Add New → Project** → chọn repo → Framework: *Other* → chưa Deploy vội, mở **Environment Variables**:

| Biến | Giá trị |
|---|---|
| `GAS_URL` | Webbapp-URL (kết thúc bằng `/exec`) |
| `GAS_SECRET` | từ bước 2.7 |
| `ADMIN_KEY` | mật khẩu màn hình bếp, dài và khó đoán |
| `REQUIRE_SHEET_MENU` | `1` (build thất bại thay vì dùng menu dự phòng) |
| `SDP_KEY` | khoá cho máy in, chữ + số ≥ 32 ký tự (`openssl rand -hex 24`) |
| `SDP_ID` | `hanami-kok` |

2. **Deploy**. Log build phải có dòng `Byggt från Google Sheet`.
   Lần deploy đầu tiên có thể dùng menu dự phòng nếu chưa điền biến; để `REQUIRE_SHEET_MENU` trống lần đầu, đặt `1` sau khi `/api/health` ok.
3. Mở `https://<project>.vercel.app/api/health` → `"ok": true` và thời gian `ms` (Apps Script thường 800–2500 ms).
4. **Settings → Git → Deploy Hooks** → tên `sheet-menu`, branch `main` → copy URL → dán vào Skriptegenskap `VERCEL_DEPLOY_HOOK`.
5. Thử: Sheet → **Hanami → Skicka testbeställning** → mail đến, đơn hiện trong `/kok`.

## 4. GitHub Actions tự deploy Apps Script

GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Lấy ở đâu |
|---|---|
| `CLASPRC_JSON` | toàn bộ nội dung `~/.clasprc.json` sau khi `clasp login` |
| `GAS_SCRIPT_ID` | Skript-ID (bước 2.2) |
| `GAS_DEPLOYMENT_ID` | Distributions-ID (bước 2.6) |

Từ giờ mỗi lần push thay đổi trong `apps-script/`:
`Check` chạy test + build → `Apps Script` chạy test → `clasp push` → cập nhật **đúng deployment cũ**, nên `GAS_URL` không bao giờ đổi.

Vercel tự deploy mỗi lần push `main`; mỗi pull request có bản Preview riêng.

> Token trong `CLASPRC_JSON` thuộc tài khoản Google của bạn. Nếu đổi mật khẩu hoặc thu hồi quyền, chạy lại `clasp login` và cập nhật secret.

## 5. Máy in Epson TM-m30III

Máy in **Epson TM-m30III** (khối vuông, giấy 80 mm, cổng LAN + USB, có NFC) tự gọi lên web mỗi 5 giây, có đơn mới thì in, in xong báo lại. Không cần iPad, không cần máy tính trong bếp.

```
Beställning (web) → Vercel → Apps Script → Sheet (cột "Utskriven" trống)
                                                   ▲
 TM-m30III ──POST GetRequest "có gì in không?"──▶ /api/sdp/<SDP_KEY> ──▶ hỏi Apps Script
           ◀── ePOS-Print XML: kvitto (tối đa 3 đơn/lần) ──┘
           ──POST SetResponse success="true"──▶ Sheet: "Utskriven" = giờ in
```

Máy in mất điện hay hết giấy: đơn nằm chờ, in khi máy sẵn sàng (lỗi thì đơn không bị đánh dấu). Nút **🖨** trên mỗi thẻ đơn trong `/kok` để in lại.

### 5.1 Máy và phụ kiện

| Hạng mục | Ghi chú |
|---|---|
| Máy in | **Epson TM-m30III** (đã mua). Số serial dưới đáy máy = mật khẩu mặc định của trang cấu hình |
| Mạng | **Dây LAN** từ router quán vào cổng LAN sau máy. Máy này **không có Wi-Fi sẵn**; muốn Wi-Fi phải mua thêm dongle Epson **OT-WL06** cắm cổng USB. Dây LAN ổn định hơn, nên dùng |
| Giấy | Giấy nhiệt **80 mm**, đường kính cuộn ≤ 80 mm, loại không phenol |
| Tuỳ chọn | Còi **OT-BZ20** nếu bếp ồn |

Đặt máy xa bếp nóng và hơi nước: giấy nhiệt bị đen khi quá nóng.

### 5.2 Cấu hình máy in (khoảng 15 phút, làm một lần)

**Trên Vercel (trước):** Settings → Environment Variables phải có `SDP_KEY` (chữ thường + số, ≥ 16 ký tự ngẫu nhiên, ví dụ `openssl rand -hex 12`) và `SDP_ID` = `hanami-kok`, cả hai ở **Production**. Đổi biến xong phải **Redeploy** bản Production.

**Trên máy in:**

1. Lắp giấy, cắm dây LAN vào **cổng LAN của router** (không phải cổng WAN/Internet), bật máy. Sau khoảng 1 phút máy tự in một phiếu có **IP Address** và dòng `DHCP: Enable`. Nếu in ra `192.168.192.168` và `DHCP: No Server` là dây chưa cắm đúng.
2. Vào router của quán, **đặt IP cố định** (DHCP reservation) cho máy in theo địa chỉ MAC trên phiếu.
3. Trên máy tính cùng mạng, mở `https://<IP máy in>` (trình duyệt cảnh báo chứng chỉ tự ký, chọn *Tiếp tục*). Bấm **Advanced Settings** → **Administrator Login**, mật khẩu = số serial (hoặc dòng *Initial Password* trên Network Status Sheet).
4. Tab **Status** → menu trái **TM-Intelligent** → mở **TM-i Settings** (tab mới) → **Services → Server Direct Print**:

| Trường | Giá trị |
|---|---|
| Server Direct Print | **Enable** |
| Server1 → URL | `https://hanamisushibar.se/api/sdp/<SDP_KEY>` (khi chưa trỏ tên miền: `https://hanamisushibar.vercel.app/api/sdp/<SDP_KEY>`) |
| Server1 → Interval | **5** |
| Server2, Server3 | để trống |
| ID | `hanami-kok` (phải đúng bằng `SDP_ID`) |
| Password | để trống (không dùng) |
| URL Encode / Server Authentication | giữ mặc định |

   Bấm **Apply & Restart**.
5. Trang cấu hình chính → **Device Management → Date and Time → Time Server**: Enable, server `pool.ntp.org`. Máy in cần giờ đúng để xác minh chứng chỉ HTTPS.
6. Kiểm tra từ máy tính: mở `https://hanamisushibar.vercel.app/api/sdp/<SDP_KEY>` trong trình duyệt → phải thấy `"ok": true` và `jobsWaiting`. Thấy `Not found` là key trên Vercel khác key trong URL; thấy trang 404 của Vercel là code `api/index.js` + `rewrites` chưa deploy.
7. Kiểm tra từ máy in: nút nhỏ phía sau máy → menu in ra → bấm **Feed nhanh 3 lần**, giữ Feed 1 giây → **TM-i Status Sheet**. Mục *Server Direct Print → Access Test* phải là `HTTP Status Code : 200`.
8. Đặt một đơn thử trên web (hoặc Sheet → **Hanami → Skicka testbeställning**). Trong 5–10 giây kvitto in ra, cột **Utskriven** có giờ. Kiểm tra chữ **åäö** và cắt giấy.

Không in? Xem mục 8. Thường gặp nhất: 404 (sai key hoặc chưa Redeploy), 403 (ID khác `SDP_ID`), giờ máy in sai (lỗi chứng chỉ), router chặn HTTPS ra ngoài.

**Phím trên máy:** nút trên nắp (biểu tượng giấy) là **Feed**; nút nhỏ phía sau cạnh cổng mạng in Network Status Sheet (bấm nhanh) hoặc **reset mạng** (giữ ≥ 10 giây, tránh nhầm).

### 5.3 Kvitto

Định dạng **ePOS-Print XML**, 48 ký tự mỗi dòng cho TM-m30III giấy 80 mm (`data/settings.js` → `receiptWidth`, có thể ghi đè tạm bằng biến môi trường `RECEIPT_WIDTH`), bố cục trong `lib/receipt-epos.js`. Ví dụ dưới minh hoạ bố cục (vẽ ở 42 cột):

```
              HANAMI SUSHI BAR             ← đậm, cao gấp đôi
                 16/9 18:12
==========================================
H1023                                      ← chữ lớn gấp đôi
HÄMTNING
IMORGON KL 18:30
==========================================
 1  Sushi mix 30                       409 ← đậm, cao gấp đôi
 2  Bubble tea mango                   138
------------------------------------------
KOMMENTAR:
Utan vårlök, extra chilimajonnäs           ← cao gấp đôi
------------------------------------------
Summa                               547 kr
Betalning: Kort i kassan
Anna Svensson  070-123 45 67
------------------------------------------
     hanamisushibar.se  ·  0431-472999
```

Tuỳ chọn:
- **Còi OT-BZ20**: thêm `<sound pattern="pattern_a" repeat="2"/>` trước `<cut>` trong `receipt-epos.js`.
- **Logo**: nạp logo vào máy bằng Epson TM Utility (key 32/32), thêm `<logo key1="32" key2="32" align="center"/>` đầu kvitto.
- **2 bản** (bếp + kẹp túi khách): lặp nội dung `eposReceipt` hai lần trong `sdpDocument`.

Tải: 5 giây/lần ≈ 17 000 lần gọi Apps Script mỗi ngày nếu máy bật 24/7, nằm trong giới hạn của Google nhưng nên **tắt máy in khi đóng cửa** hoặc đặt interval 10 giây.

## 6. Tên miền

Vercel → **Settings → Domains** → thêm `hanamisushibar.se` và `www.hanamisushibar.se`. Tại nhà cung cấp tên miền:

- `A` `@` → `76.76.21.21`
- `CNAME` `www` → `cname.vercel-dns.com`

Đổi DNS là trang cũ ngừng hiện ngay, nên hẹn giờ với quán. Giữ nguyên bản ghi MX nếu quán có mail trên tên miền.

## 7. Quán dùng hằng ngày

**iPad trong bếp**: `https://hanamisushibar.se/kok` → Safari → Chia sẻ → *Lägg till på hemskärmen*. Mở xong bấm **Ljud på** một lần.

- **Máy in** tự in mọi đơn mới (cả hämtning lẫn tại bàn). Thẻ đơn ghi `🖨 18:12` khi đã in, `🖨 väntar` khi chưa.
- **Beställningar**: đơn hôm nay, tự làm mới 20 giây, kêu bíp khi có đơn mới. Börja tillaga → Klar (khách hämtning nhận SMS) → Hämtad/Serverad.
- **Bokningar**: Bekräfta / Avböj, khách nhận SMS.
- **Meny idag**: gạt công tắc để báo hết món.
- **QR‑koder**: in QR cho từng bàn, trỏ tới `/meny?bord=N` (làm sau khi tên miền đã trỏ đúng).
- **Google Sheet**: mở thẳng bảng tính. Đổi cột *Status* trong Sheet cũng gửi SMS như trong bếp.

### 7.1 Sushi mix: chọn maki, đổi nigiri

Sushi mix 8, 10, 12, 15, 20 và Mamma mix mở hộp chọn khi khách bấm +:
- Mỗi phần "5 maki (kockens val)" đổi được sang 5 miếng California, Chili, Philadelphia, Alaskan, Green hoặc Vegan maki – miễn phí. Sushi mix 20 có 2 cuộn, chọn riêng từng cuộn.
- Nigiri đổi tự do. 4 miếng đổi đầu tiên miễn phí, từ miếng thứ 5 cộng 10 kr/miếng.
- Lựa chọn in lên phiếu bếp, hiện trong köksvy và e-mail, ví dụ `Maki: 5 Philadelphia maki · Nigiri: 5 tonfisk, 2 avokado`.

Nigiri (nigiri-1) và Special nigiri (nigiri-2): khách bấm + từng sort muốn lấy, giá theo cột Pris trong Sheet × số miếng (19 kr và 23 kr). Nigiri: lax, tonfisk, avokado, krabbstick, jätteräka, tofu, wakame, krabbröra. Special: flamberad lax, flamberad jätteräka.

Bubble tea (bubble-1, bubble-2, bubble-3): khách chọn 1 popping boba (mango, jordgubb, blåbär, lychee) – ingår. Extra boba từng vị và extra tapioka +10 kr mỗi thứ. Khách chưa chọn boba thì không thêm được vào giỏ.

Thành phần từng mix, danh sách nigiri/maki được đổi và mức phí nằm trong `lib/mix.js`. **Nếu quán sửa mô tả một mix trong Google Sheet, phải sửa `lib/mix.js` theo.** Happy hour không cho đổi.

Phí đổi được Vercel tính (`lib/mix.js`) rồi Apps Script cộng vào giá trong fliken Meny, nên sau khi cập nhật code phải đẩy cả Apps Script (`npm run gas:deploy` hoặc GitHub Actions).

### 7.2 Giờ lấy đơn: chủ quán chọn "klar om …"

Khách **không tự chọn giờ lấy** nữa. Giờ lấy = **bây giờ (hoặc giờ mở cửa, nếu đặt trước khi mở) + thời gian chủ quán chọn**, làm tròn lên 5 phút.

- Màn hình bếp `/kok`, tab Beställningar có hàng nút **Hämtning klar om**: 15 · 20 · 30 · 45 min · 1 h · 1 h 15 · 1 h 30 · 2 h. Bấm là lưu ngay. Quán đông thì bấm 45 hoặc 1 h, vắng thì về 30.
- Giá trị lưu trong Skriptegenskaper `PICKUP_LEAD` của Apps Script. Apps Script tính giờ lấy cuối cùng khi nhận đơn, nên đơn luôn dùng giá trị mới nhất. Trang khách hiện giờ dự kiến; giá trị trên trang cập nhật chậm nhất khoảng 3 phút.
- Chưa bấm gì thì dùng mặc định `pickupLeadMinutes` trong `data/settings.js` (30 phút).
- Khách muốn lấy muộn hơn ghi vào ô **"Vill du hämta senare?"**. Nội dung vào phần ghi chú, in dưới **KOMMENTAR** dạng `Önskar hämta: kl 18.30`.
- Ngày đóng cửa, sau giờ đóng cửa, hoặc khi giờ lấy vượt quá giờ đóng cửa: trang khách báo và không cho gửi đơn.
- Chỉ nhận đơn lấy trong ngày. `pickupDaysAhead` không còn dùng cho đơn mang về.

### 7.3 Betald: đánh dấu đơn đã trả tiền

Mỗi thẻ đơn trong köksvy có nút **Markera betald**. Bấm là ghi giờ vào cột `Betald` trong fliken Beställningar, thẻ hiện nhãn xanh "Betald".

- Phiếu in: đơn đã trả in dòng **BETALD · SWISH** cỡ gấp đôi, in đậm. Đơn chưa trả in **EJ BETALD · SWISH** cỡ thường, in đậm, để chủ quán thấy ngay phải thu tiền.
- Phiếu in ra lúc nhận đơn luôn là "Ej betald", vì lúc đó tiền chưa vào. Sau khi bấm Betald, bấm nút 🖨 trên thẻ để in lại phiếu cho chủ quán.
- Hệ thống **không tự biết** khách đã Swish hay chưa. Nhân viên xem app Swish rồi bấm tay. Muốn tự động thì phải làm Swish Handel.
- Cột `Betald` là cột mới, nên sau khi đẩy code phải **chạy `setup()` một lần** trong Apps Script để thêm cột vào Sheet.

### 7.4 Dricks (tiền tip)

Ở bước thanh toán, khách chọn 5, 10, 15, 20 % hoặc tự nhập số tiền (tối đa 2000 kr). Nút gửi đơn hiện tổng đã cộng tip.

- Tip được tính lại trên server theo giá trong fliken Meny, không tin số từ trình duyệt.
- Lưu ở cột `Dricks` (cột mới) trong fliken Beställningar. Cột `Summa` là tổng đã gồm tip.
- Phiếu in có dòng `Dricks` ngay trên dòng `Summa`. Mail cho khách và mail cho quán cũng hiện tip.
- Cột `Dricks` là cột mới, nên sau khi đẩy code phải **chạy `setup()` một lần** trong Apps Script.

### 7.5 Sửa menu trong Sheet bằng code (không cần sửa tay)

File `data/menu-andringar.js` chứa danh sách thay đổi menu: đổi tên, giá, mô tả (`set`), thêm món mới ngay sau một món có sẵn (`add`), ẩn món (`hide`), và sửa Kategoritext (`notes`).

- Mỗi lần push, Vercel build bản production sẽ gọi Apps Script (`applyMenuPatches`) để đưa các thay đổi **chưa chạy** vào fliken Meny, rồi mới đọc menu để build trang. Nghĩa là **push xong là Sheet và web cùng cập nhật**.
- Mỗi thay đổi có một `id` và chỉ chạy **một lần**. Danh sách id đã chạy lưu trong Skriptegenskaper `MENU_PATCHES_DONE`. Muốn đổi tiếp thì thêm mục mới với id mới ở cuối file, đừng sửa mục cũ.
- Chỉ những ô được ghi trong thay đổi mới bị đụng tới. Giá hoặc chữ quán tự sửa trong Sheet ở chỗ khác được giữ nguyên.
- Không bao giờ xoá hàng. Món bỏ đi thì chỉ bỏ tick "Visas på webben".
- Kết quả ghi trong fliken Logg (dòng "Menyändringar") và trong build log trên Vercel.
- Cần Apps Script bản mới (có `applyMenuPatches`). Nếu Apps Script cũ, build vẫn chạy bình thường, chỉ báo cảnh báo và bỏ qua bước này.

### 7.6 Tắt / mở đặt món online (một chạm)

Khi quán không muốn nhận đơn qua web (chờ Swish Handel, quá đông, máy in hỏng…):

- **Màn hình bếp `/kok`**, ngay dưới thanh công cụ: ô **Onlinebeställning PÅ/AV** với nút **Stäng beställning / Öppna beställning**. Tắt có hộp xác nhận; mở lại không hỏi.
- Hoặc trong Sheet: menu **Hanami → Onlinebeställning PÅ / AV**.
- Trạng thái lưu trong Skriptegenskaper `ORDERING_OPEN` (`on`/`off`), lời nhắn tuỳ chọn trong `ORDERING_MESSAGE` (mặc định: "Onlinebeställning är tillfälligt stängd. Ring oss på 0431-472999 så hjälper vi dig.").
- **Khi tắt:** trang menu vẫn xem được nhưng hiện băng thông báo đỏ nhạt với nút gọi điện, nút **+** bị khoá, giỏ hàng cũ vẫn còn nhưng không gửi được. Server (Apps Script) từ chối mọi đơn với mã 423, nên không lách được. Đơn tại bàn (QR) cũng bị chặn. **Đặt bàn vẫn hoạt động bình thường.**
- Trang khách cập nhật trong tối đa 3 phút (cache 60 s + hỏi lại mỗi 2 phút); server chặn ngay lập tức.
- `/api/health` hiện `ordering: open | closed`. Testbeställning từ menu Sheet vẫn chạy khi đang tắt (dùng để thử máy in).

### 7.7 Dọn dẹp tự động: Sheet luôn nhẹ (`apps-script/Cleanup.js`)

Mỗi đêm **04:30** Apps Script tự dọn tab Beställningar, Bokningar và Logg để web, màn hình bếp và máy in luôn nhanh:

| Việc | Quy tắc | Ghi chú |
|---|---|---|
| **Lưu trữ** | Đơn và đặt bàn có ngày cũ hơn **30 ngày** → chuyển sang file Sheet riêng **"Hanamisushibar – Arkiv"**, rồi xoá khỏi Sheet chính | Luật kế toán Thuỵ Điển (Bokföringslagen) yêu cầu giữ chứng từ 7 năm, nên không xoá mà **chuyển**. Chuyển xong mới xoá; chuyển lỗi thì không đụng gì |
| **Xoá hẳn** | Đơn/đặt bàn **Avbokad** cũ hơn 7 ngày; dòng **Logg** cũ hơn 14 ngày | Không có doanh thu, không cần lưu |
| **Ẩn danh** | Trong file lưu trữ, dòng cũ hơn **12 tháng** bị xoá tên, điện thoại, e-mail, ghi chú (kể cả ghi chú dị ứng trong món) | GDPR, đúng thoả thuận 12 tháng với quán. Giữ lại số tiền, món, ngày, loại đơn cho kế toán |

- "Ngày" của một dòng là ngày **muộn nhất** giữa *Mottagen* và *Hämtas datum/Datum*. Đặt bàn cho tháng sau không bao giờ bị dọn.
- Không bao giờ đụng tab **Meny**. Chạy dưới LockService nên đơn vào cùng lúc không bị mất.
- Tối đa 1 500 dòng mỗi đêm, dừng sau 4 phút; phần còn lại dọn đêm sau.
- Mặc định là **provkörning** (chỉ đếm, không đổi gì) cho tới khi bật.

**Bật lần đầu (menu Hanami → Städning trong Sheet):**
1. **Provkör** → xem số liệu: bao nhiêu đơn sẽ lưu trữ, bao nhiêu bị xoá.
2. Thấy hợp lý → **Slå på nattlig städning**. Từ đó mỗi sáng tab Logg có một dòng "Städning: Arkiverat …".
3. Muốn dọn ngay (lần đầu Sheet đang đầy) → **Städa nu**.
4. **Öppna arkivarket** cho link file lưu trữ. Quán có thể chia sẻ file này cho kế toán.

Thay đổi quy tắc: sửa số ngày trong `CLEAN` đầu file `Cleanup.js`. `/api/health` hiện số dòng từng tab (`rows`) và trạng thái dọn dẹp (`cleanup: on | dry-run`).

**`setup()` nhanh:** chỉ làm phần bắt buộc (tiêu đề cột, trigger, khoá), vài giây, và ghi thời gian từng bước vào Logg/nhật ký thực thi. Định dạng (kiểu chữ, màu trạng thái, checkbox) chỉ làm cho tab mới tạo. Thêm món mới vào tab Meny thì chọn **Formatera menyfliken**; cần làm lại toàn bộ định dạng thì **Lägg om all formatering (långsamt)**, giới hạn ở số dòng đang có + 500 nên không còn quét cả bảng trống.

## 8. Khi có sự cố

| Dấu hiệu | Kiểm tra |
|---|---|
| `/api/health` báo `Apps Script gav inget JSON` | Webbapp chưa để *Åtkomst: Alla*, hoặc cần cấp quyền lại: chạy `setup` một lần trong Apps Script |
| `401` / `Obehörig` | `GAS_SECRET` trên Vercel khác `API_SECRET` trong Skriptegenskaper |
| Build dùng "reservmeny" | Sheet không truy cập được lúc build; xem log Vercel |
| Không có mail | `NOTIFY_EMAIL`; hạn mức Gmail thường 100 mail/ngày (Workspace 1 500) |
| Không có SMS | Tab **Logg** trong Sheet ghi lỗi 46elks; kiểm tra số dư |
| Mọi lỗi khác | Tab **Logg**; Vercel → Logs (lọc `[hanami]`); Apps Script → Körningar |
| Máy in không in | Mở `https://…/api/sdp/<SDP_KEY>` trong trình duyệt: `"ok": true` → web ổn, lỗi ở máy in (in TM-i Status Sheet xem Access Test); `Not found` → key sai/chưa Redeploy; trang 404 Vercel → thiếu `rewrites`. Máy in: đèn lỗi, giấy, `ID` = `SDP_ID`, giờ máy in (Time Server), router cho phép HTTPS. Vercel → Logs lọc `[sdp]` |
| In 2 lần cùng một đơn | Mạng chập chờn làm máy in không gửi được SetResponse; đơn đã in vẫn đúng, chỉ cần bỏ bản thừa |
| Chữ åäö sai | Đổi `lang` trong thẻ `<text lang=…>` ở `receipt-epos.js` (xem ePOS-Print XML manual) |
| Web/köksvy chậm dần | `/api/health` → `rows.orders` lớn (vài nghìn)? Bật dọn dẹp (7.7) hoặc **Städa nu**. Mail "städningen misslyckades" → xem tab Logg, dòng ERROR Städning |
| Dọn dẹp báo lỗi quyền | Lần đầu `SpreadsheetApp.create` cần cấp quyền: chạy **Provkör** từ menu rồi chấp nhận hộp thoại quyền |

## 9. Trước khi bàn giao

- **Chủ sở hữu dữ liệu**: Sheet và Apps Script nên nằm trong tài khoản của quán (hoặc Workspace của bạn với quyền chia sẻ rõ ràng). Webbapp chạy dưới quyền người deploy.
- **GDPR**: Sheet chứa tên và số điện thoại khách. Dọn dẹp tự động (7.7) ẩn danh dữ liệu cũ hơn 12 tháng; ghi điều này trong chính sách bảo mật trên web.
- **Vercel Hobby** chỉ cho mục đích phi thương mại; web nhà hàng nên chạy trên **Pro**.
- Apps Script mất khoảng 1–3 giây mỗi yêu cầu; đủ cho một quán, và lock bảo đảm hai đơn cùng lúc không bị trùng số.
- Không có thanh toán online; khách trả Swish/thẻ tại quán.
- Menu mẫu lấy từ trang cũ; nhờ quán xác nhận Happy hour mix ghi "tofu" còn mix thường ghi "tonfisk".

---

## Phụ lục A – Đổi sang Star CloudPRNT

Dùng khi quán đổi sang máy Star có CloudPRNT (mC-Print3, hoặc SP742 **có card IFBD-HI02X**). Endpoint đã có sẵn.

`CLOUDPRNT_KEY` (+ tuỳ chọn `CLOUDPRNT_MAC`), web UI máy in → CloudPRNT → URL `https://hanamisushibar.se/api/cloudprnt/<CLOUDPRNT_KEY>`, interval 5 s. Kvitto ở `lib/receipt-star.js`, bề rộng 48.

Với SP742 (42 ký tự/dòng) đổi `WIDTH` trong `lib/receipt-star.js` thành 42.

## Phụ lục B – Cầu in cho máy in thường (không có in từ web)

Dùng cho máy như Epson TM-T20III: một máy nhỏ trong bếp (Raspberry Pi) chạy `print-bridge/`, hỏi web và gửi lệnh in qua USB/LAN. Khoá: `PRINT_KEY`.

Epson TM-T20III có hai bản, giá gần nhau (~1 800 kr):

| Bản | Kết nối | Nên chọn khi |
|---|---|---|
| **011** (C31CH51011) | USB + Serial | Có sẵn máy tính đặt cạnh máy in |
| **012** (C31CH51012) | Ethernet (cáp mạng) | Máy in đặt bất kỳ đâu có mạng; linh hoạt hơn về sau (ePOS) |

Cả hai đều chạy được với thiết kế dưới. Nếu quán chưa mua, **khuyên lấy 012**: máy in cắm vào router, không phụ thuộc cổng USB, và "cầu in" có thể chạy trên bất kỳ máy nào trong mạng.

Mua kèm: giấy nhiệt 80 mm, và với bản 011 kiểm tra hộp có cáp USB (Epson thường không kèm).

```
Beställning (web) → Vercel → Apps Script → Sheet (cột "Utskriven" trống)
                                                   ▲
                                                   │ GET /api/print (x-print-key), mỗi 5 s
                                            Cầu in (print-bridge/) trên máy trong bếp
                                                   │ ESC/POS
                                                   ▼
                                            Epson TM-T20III → kvitto
                                                   │
                                            POST /api/print { no } → "Utskriven" = giờ
```

Cầu in (`print-bridge/`) là một script Node không cần thư viện ngoài. Nó hỏi web mỗi 5 giây có đơn mới chưa in, in xong mới báo lại; nếu máy in mất điện, đơn vẫn nằm trong hàng đợi và được in khi máy in trở lại. Bếp có nút **🖨** trên mỗi thẻ đơn trong `/kok` để in lại.

#### Máy chạy cầu in
- **Raspberry Pi 4 (2 GB) hoặc Pi Zero 2 W** (~500–900 kr): nhỏ, im lặng, chạy 24/7, cắm USB thẳng vào máy in. Khuyên dùng.
- Hoặc **máy tính kassa** của quán nếu luôn bật (Windows/macOS): chạy cùng script.
- iPad **không** chạy được cầu in; iPad chỉ dùng cho `/kok`.

#### Cài đặt trên Raspberry Pi (bản 011, USB)

```bash
# Raspberry Pi OS Lite, cài Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs git
git clone https://github.com/<tai-khoan>/hanami-sushibar.git ~/hanami-sushibar
cd ~/hanami-sushibar/print-bridge
cp config.example.json config.json && nano config.json     # apiUrl, printKey, printer
sudo cp 99-epson.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger
node index.mjs --test                                      # phải in ra một testkvitto
sudo cp hanami-print.service /etc/systemd/system/ && sudo systemctl enable --now hanami-print
journalctl -u hanami-print -f                              # xem log
```

`printer` trong `config.json`:
- bản 011 trên Pi/Linux: `usb:/dev/usb/lp0`
- bản 012: `tcp:<IP máy in>:9100` (in trang status bằng nút Feed khi bật máy để thấy IP; đặt IP tĩnh trong router)
- macOS/Linux qua CUPS: `cups:<tên hàng đợi>` (thêm máy in dạng *Raw*)
- Windows: chia sẻ máy in với tên `EpsonTM` → `file:\\\\localhost\\EpsonTM`

`PRINT_KEY`: đặt một chuỗi bí mật trong Vercel → Environment Variables, và điền cùng giá trị vào `config.json`. Khoá này chỉ có quyền đọc hàng đợi in và đánh dấu đã in, không truy cập được gì khác.

#### Tuỳ chọn thêm
- **Còi báo**: Epson OT-BZ20 (cắm vào cổng drawer của máy in) kêu khi có đơn; thêm lệnh xung `ESC p` trong `receipt.mjs`. iPad ở `/kok` đã kêu bíp sẵn.
- **Logo trên kvitto**: nạp logo vào bộ nhớ máy in bằng Epson TM-T20III Utility, rồi thêm lệnh `FS p 1 0` đầu kvitto.

---

## Thanh toán online (Q89 Pay · Stripe Connect) — thêm ngày 2026-10-06

> Gộp ngày 6/10 với công tắc **Onlinebeställning PÅ/AV** (7.6): khi quán tắt đơn, `/api/pay` cũng bị chặn (423) nên không thu tiền; một thanh toán đã hoàn tất trước khi tắt vẫn tạo đơn vì tiền đã vào. Bật `payOnline` chỉ khi Stripe đã cấu hình xong (xem bên dưới); trong lúc chờ Swish Handel/Stripe, dùng công tắc 7.6 để đóng đặt món.

Khách trả **ngay trong giỏ hàng** bằng kort, Apple Pay hoặc Google Pay qua Stripe. **Swish không đi qua Stripe**: khách swish thẳng tới số của quán như trước (không mất 4 % + 2 kr), nhân viên bấm "Markera betald" trong köksvyn. Hanami là người bán
(tên Hanami hiện trên sao kê và trong app Swish của khách); Queenie89 AB là nền tảng, thu 4 % + 2 kr mỗi đơn tự động.

### Cách chạy

```
Giỏ hàng → "Betala nu" → POST /api/pay → Apps Script payPending (tính giá theo tab Meny, ghi vào tab Betalningar, CHƯA tạo đơn)
         → Stripe Checkout (destination charge, on_behalf_of = tài khoản Hanami)
Khách trả → Stripe webhook → /api/stripe/webhook → Apps Script payConfirm → createOrder_ (Betald = giờ, Betalning = "Online kort/Swish")
         → in bếp (Utskriven), SMS, mejl như đơn thường
Khách bấm huỷ / quá 30 phút → payFail → tab Betalningar ghi "misslyckad"/"utgången", KHÔNG có đơn
Trang /tack?ref&sid poll GET /api/pay tới khi "betald", rồi xoá giỏ hàng.
```

Bếp **không bao giờ** thấy đơn online chưa trả. Giá khoá tại lúc bắt đầu trả; món hết sau đó không ảnh hưởng đơn đã trả.

### File đã thêm / sửa

| File | Việc |
|---|---|
| `apps-script/Pay.js` | mới: payPending, paySession, payConfirm (idempotent, kiểm tra đúng số tiền), payFail, payStatus, dọn rác 2 ngày |
| `apps-script/Orders.js` | tách `priceLines_()` khỏi `createOrder_()`; `createOrder_(p, pre)` nhận dòng đã tính giá; nhãn Betalning "Online kort/Swish"; cột **Stripe** (payment intent) |
| `apps-script/Config.js`, `Setup.js`, `Api.js` | tab mới **Betalningar**, cột **Stripe** trong Beställningar, 5 action mới |
| `apps-script/Notify.js` | mejl khách ghi "Betald online" |
| `lib/stripe.js` | mới: gọi Stripe REST bằng fetch (không thêm npm), ký/kiểm chữ ký webhook, tính phí |
| `lib/routes/pay.js` | mới: POST tạo Checkout, GET trạng thái |
| `lib/routes/submit.js` | tách `buildOrder()` dùng chung; từ chối `payment: online` (phải qua /api/pay) |
| `api/stripe-webhook.js` | mới: function riêng, tắt body-parser để kiểm chữ ký trên raw body |
| `api/index.js`, `vercel.json` | route `pay`; rewrite `/api/stripe/webhook`; header no-store cho `/tack` |
| `src/meny.html`, `src/common.js` | lựa chọn "Betala med kort nu" (mặc định khi bật), nút "Betala X kr", quay lại khi huỷ; Swish thủ công giữ nguyên |
| `src/tack.html`, `scripts/build.mjs` | trang cảm ơn `/tack` |
| `data/settings.js` | cờ `payOnline` (false = ẩn lựa chọn online) |
| `tests/pay.test.mjs`, `tests/apps-script.test.cjs` | 13 + 6 test mới; `npm test` chạy cả |

### Triển khai, theo thứ tự

1. **Apps Script**: `npm run gas:push` rồi trong Sheet chạy **Hanami → setup** một lần (tạo tab Betalningar, thêm cột Stripe). Deploy webapp phiên bản mới (`gas:deploy`).
2. **Stripe – tài khoản Hanami**: Dashboard → tài khoản nền tảng **Queenie89 AB** → Connect → Anslutna konton → **Skapa** → Express, Sverige → nhập e-post chủ quán → Stripe gửi link onboarding. Chủ quán điền BankID, org.nr, IBAN (10–15 phút). Chép `acct_…` vào Vercel.
   Ô "Business website" của Hanami: `https://hanamisushibar.se`. Trước đó web Hanami phải có trang **Integritetspolicy** (mẫu `mall-integritetspolicy/integritetspolicy-sv.html` từ Q89, đã điền) link ở chân trang.
3. **Stripe – nền tảng**: Betalningsmetoder bật Kort, Apple/Google Pay (code khoá `payment_method_types: ["card"]`, nên Swish/Klarna không hiện dù có bật). Skattesatser: "Moms 12 %", inkluderad → `txr_…`. Webhook endpoint `https://hanamisushibar.se/api/stripe/webhook` với 4 händelser (xem bảng dưới) → `whsec_…`.
4. **Vercel → Environment Variables** (Production):

   | Biến | Giá trị |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_live_…` của **Queenie89 AB** (nền tảng). Test: `sk_test_…` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
   | `STRIPE_ACCOUNT` | `acct_…` của Hanami |
   | `STRIPE_TAX_RATE_12` | `txr_…` (12 % inkluderad) |
   | `STRIPE_FEE_PCT` / `STRIPE_FEE_FIXED` | `4` / `2` (mặc định, có thể bỏ trống) |
   | `SITE_URL` | `https://hanamisushibar.se` (đã có từ trước nếu dùng cho Apps Script thì để nguyên) |

5. Đặt `payOnline: true` trong `data/settings.js` → commit → deploy. Lựa chọn "Betala nu" xuất hiện trong giỏ hàng.
6. **Thử thật một lần**: tự đặt món rẻ nhất tại bàn 1, trả bằng thẻ của chị. Kiểm tra: in ra bếp với dòng **BETALD · ONLINE KORT**, tab Beställningar có cột Stripe, tab Betalningar ghi "betald", Dashboard Stripe hiện charge với *Överföring* sang Hanami và *Plattformsavgift* = 4 % + 2 kr. Rồi **Återbetala** từ Dashboard (tick *Återbetala plattformsavgift* nếu muốn trả cả phí cho lần thử này).

Webhook händelser: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.

### Test mode trước khi live
Dùng `sk_test_…`, tạo Express account test, thẻ `4242 4242 4242 4242` (3DS: `4000 0025 0000 3155`, từ chối: `4000 0000 0000 9995`). `stripe listen --forward-to localhost:3000/api/stripe/webhook` với `vercel dev` để nhận webhook ở máy.

### Hoàn tiền
Luôn làm trong **Stripe Dashboard** (tài khoản nền tảng → Betalningar → chọn → Återbetala). Stripe tự kéo tiền ngược từ tài khoản Hanami (*reverse transfer*). Phí nền tảng mặc định không hoàn (đúng Villkor för företagskunder §4); tick ô nếu muốn hoàn cả phí. Thẻ hoàn về tài khoản khách sau 5–10 ngày ngân hàng.

### Nếu có lỗi
| Triệu chứng | Xem |
|---|---|
| Nút "Betala nu" không hiện | `payOnline` trong settings.js; build lại |
| Bấm Betala → "Onlinebetalning är inte aktiverad" | thiếu `STRIPE_SECRET_KEY` hoặc `STRIPE_ACCOUNT` trên Vercel |
| Trả xong nhưng /tack quay mãi | Stripe → Webhooks → endpoint → fliken *Försök*: 400 = sai `STRIPE_WEBHOOK_SECRET`; 500 = lỗi Apps Script, xem tab Logg |
| Tab Logg: "Stripe-belopp avviker" | ai đó sửa giá trong tab Meny giữa chừng; đơn không tạo, tiền đã thu → hoàn tiền thủ công từ Dashboard và liên hệ khách |
| Khách trả nhưng Stripe giữ tiền | tài khoản Hanami chưa xác minh xong (`charges_enabled` nhưng `payouts_enabled` = false) → chủ quán bổ sung giấy tờ trong Express Dashboard |

### Dữ liệu cá nhân
Tab Betalningar chứa bản sao đơn (tên, điện thoại) **chỉ trong lúc chờ thanh toán**. Khi trả xong, `payConfirm` xoá bản sao đó (chỉ giữ loại đơn + số bàn); dữ liệu khách nằm duy nhất ở Beställningar và theo Cleanup như trước. Dòng chưa trả xoá sau 2 ngày. Không cần sửa `Cleanup.js`.

Lưu ý khớp văn bản pháp lý: Cleanup của Hanami ẩn danh sau **12 tháng** (thoả thuận với quán). Mẫu Integritetspolicy Q89 gửi phải điền `{{ANONYMISERING}}` = "12 månader" cho Hanami.
