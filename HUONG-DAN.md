# Hanami Sushi Bar – hướng dẫn triển khai

Apps Script + GitHub + Vercel + máy in Epson TM-T88VII

## Checklist triển khai

| # | Việc | Ai | Xong khi |
|---|---|---|---|
| 0 | Chrome profile riêng + bật Apps Script API | Bạn | — |
| 1 | Push repo lên GitHub | Bạn | `npm test` 15 tester OK |
| 2 | Sheet + Apps Script: `setup`, Skriptegenskaper, Distribuera webbapp | Bạn | Menu **Hanami** xuất hiện |
| 3 | Vercel: env, deploy, Deploy Hook | Bạn | `/api/health` → `"ok": true` |
| 4 | GitHub Actions secrets | Bạn | Action "Apps Script" xanh |
| 5 | Máy in TM-T88VII | Bạn + quán | Testbeställning in ra |
| 6 | Tên miền | Bạn + quán | `https://hanamisushibar.se` mở web mới |
| 7 | In QR bàn, cài `/kok` trên iPad, hướng dẫn nhân viên | Quán | Đơn thử từ bàn in ra ở bếp |
| 8 | Chạy thử 1 ngày trước khi quảng bá | Cả hai | Không có lỗi trong tab **Logg** |

### Một hàm serverless duy nhất

Vercel gói Hobby chỉ cho tối đa 12 serverless function mỗi lần deploy. Vì vậy toàn bộ API đi qua **một** file duy nhất `api/[...route].js`, file này chuyển tiếp sang các handler trong `lib/routes/`:

| Đường dẫn | Handler |
|---|---|
| `/api/submit` | `lib/routes/submit.js` – đặt món và đặt bàn |
| `/api/admin` | `lib/routes/admin.js` – màn hình bếp (cần `x-admin-key`) |
| `/api/availability` | `lib/routes/availability.js` – giá và món hết, cache 60 giây |
| `/api/health` | `lib/routes/health.js` – kiểm tra kết nối Google Sheet |
| `/api/print` | `lib/routes/print.js` – cầu nối Raspberry Pi (dự phòng) |
| `/api/sdp/<SDP_KEY>` | `lib/routes/sdp.js` – Epson Server Direct Print |
| `/api/cloudprnt/<KEY>` | `lib/routes/cloudprnt.js` – Star CloudPRNT (dự phòng) |

Thêm đường dẫn mới: viết handler trong `lib/routes/` rồi khai báo trong bảng `ROUTES` của router. Số lượng endpoint không còn bị giới hạn.

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
| **Epson TM-T88VII** | Tự hỏi web mỗi 5 giây, có đơn là in (Server Direct Print) | Quán (chỉ cắm điện + LAN) |
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

## 5. Máy in Epson TM-T88VII

Máy in **Epson TM-T88VII** tự gọi lên web mỗi 5 giây, có đơn mới thì in, in xong báo lại. Không cần iPad, không cần máy tính trong bếp.

```
Beställning (web) → Vercel → Apps Script → Sheet (cột "Utskriven" trống)
                                                   ▲
 TM-T88VII ──POST GetRequest "có gì in không?"──▶ /api/sdp/<SDP_KEY> ──▶ hỏi Apps Script
           ◀── ePOS-Print XML: kvitto (tối đa 3 đơn/lần) ──┘
           ──POST SetResponse success="true"──▶ Sheet: "Utskriven" = giờ in
```

Máy in mất điện hay hết giấy: đơn nằm chờ, in khi máy sẵn sàng (lỗi thì đơn không bị đánh dấu). Nút **🖨** trên mỗi thẻ đơn trong `/kok` để in lại.

### 5.1 Mua máy

| Hạng mục | Chọn | Ghi chú |
|---|---|---|
| Máy in | **Epson TM-T88VII, bản Ethernet + USB** (châu Âu thường ghi *(112)*, C31CJ57112) | Tránh bản chỉ Serial/Parallel |
| Nguồn | **PS-180** | Kiểm tra có kèm; một số nơi bán "utan nätadapter" |
| Giấy | Giấy nhiệt **80 mm**, lõi 12 mm, đường kính ≤ 83 mm, loại **không phenol** | |
| Cáp | Cáp mạng Cat5e/Cat6 tới router | |
| Tuỳ chọn | Còi **OT-BZ20** (~600 kr) | Bếp ồn thì rất nên có |

Giá tham khảo: 4 000–4 800 kr kèm moms. Đặt máy in xa bếp nóng và hơi nước: giấy nhiệt bị đen khi quá nóng.

### 5.2 Cấu hình máy in (khoảng 15 phút)

1. Vercel → Environment Variables: kiểm tra đã có `SDP_KEY` (chỉ chữ và số, ≥ 32 ký tự) và `SDP_ID` = `hanami-kok`. Có thay đổi thì **Redeploy**.
2. Lắp giấy, cắm LAN vào router, bật máy. Máy tự in một phiếu có **IP address** (nếu không: tắt máy, giữ nút **FEED**, bật máy, thả nút khi bắt đầu in).
3. Vào router của quán, **đặt IP cố định** (DHCP reservation) cho máy in theo MAC in trên phiếu.
4. Mở cấu hình máy in bằng một trong hai cách:
   - Trình duyệt trên máy tính cùng mạng: `http://<IP máy in>` (tên đăng nhập `epson`, mật khẩu mặc định là số serial in dưới đáy máy), hoặc
   - App **Epson TM Utility** trên điện thoại (cùng Wi-Fi quán).
5. Mục **Server Direct Print**:

| Trường | Giá trị |
|---|---|
| Server Direct Print | **Enable** |
| ID | `hanami-kok` |
| URL (Server 1) | `https://hanamisushibar.se/api/sdp/<SDP_KEY>` |
| Interval | **5** giây |
| Timeout | 10 giây (mặc định) |

6. Mục thời gian (**Time/SNTP**): bật, server `pool.ntp.org`, múi giờ Stockholm. Máy in cần giờ đúng để xác minh chứng chỉ HTTPS.
7. Lưu, máy in khởi động lại.
8. Kiểm tra: Sheet → **Hanami → Skicka testbeställning**. Trong vòng 10 giây kvitto phải in ra và cột **Utskriven** có giờ. Kiểm tra chữ **åäö** và cắt giấy.

Không in? Xem mục 8. Thường gặp nhất: sai URL/khoá, sai `ID`, giờ máy in sai (lỗi chứng chỉ), hoặc router chặn HTTPS ra ngoài.

### 5.3 Kvitto

Định dạng **ePOS-Print XML**, 42 ký tự mỗi dòng (`data/settings.js` → `receiptWidth`), bố cục trong `lib/receipt-epos.js`:

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

Thành phần từng mix, danh sách nigiri/maki được đổi và mức phí nằm trong `lib/mix.js`. **Nếu quán sửa mô tả một mix trong Google Sheet, phải sửa `lib/mix.js` theo.** Happy hour không cho đổi.

Phí đổi được Vercel tính (`lib/mix.js`) rồi Apps Script cộng vào giá trong fliken Meny, nên sau khi cập nhật code phải đẩy cả Apps Script (`npm run gas:deploy` hoặc GitHub Actions).

## 8. Khi có sự cố

| Dấu hiệu | Kiểm tra |
|---|---|
| `/api/health` báo `Apps Script gav inget JSON` | Webbapp chưa để *Åtkomst: Alla*, hoặc cần cấp quyền lại: chạy `setup` một lần trong Apps Script |
| `401` / `Obehörig` | `GAS_SECRET` trên Vercel khác `API_SECRET` trong Skriptegenskaper |
| Build dùng "reservmeny" | Sheet không truy cập được lúc build; xem log Vercel |
| Không có mail | `NOTIFY_EMAIL`; hạn mức Gmail thường 100 mail/ngày (Workspace 1 500) |
| Không có SMS | Tab **Logg** trong Sheet ghi lỗi 46elks; kiểm tra số dư |
| Mọi lỗi khác | Tab **Logg**; Vercel → Logs (lọc `[hanami]`); Apps Script → Körningar |
| Máy in không in | `/api/health` ok? Máy in: đèn lỗi, giấy, URL/`SDP_KEY`, `ID` = `SDP_ID`, giờ máy in (SNTP), router cho phép HTTPS. Vercel → Logs lọc `[sdp]` |
| In 2 lần cùng một đơn | Mạng chập chờn làm máy in không gửi được SetResponse; đơn đã in vẫn đúng, chỉ cần bỏ bản thừa |
| Chữ åäö sai | Đổi `lang` trong thẻ `<text lang=…>` ở `receipt-epos.js` (xem ePOS-Print XML manual) |

## 9. Trước khi bàn giao

- **Chủ sở hữu dữ liệu**: Sheet và Apps Script nên nằm trong tài khoản của quán (hoặc Workspace của bạn với quyền chia sẻ rõ ràng). Webbapp chạy dưới quyền người deploy.
- **GDPR**: Sheet chứa tên và số điện thoại khách. Thoả thuận với quán thời gian lưu (ví dụ xoá dữ liệu cũ hơn 12 tháng) và ghi trong chính sách bảo mật trên web.
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
