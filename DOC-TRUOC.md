# Bản cập nhật máy in TM-m30III — đưa lên GitHub một lần

Thư mục này chứa **đúng các file cần thay/thêm** trong repo `viecnha247vn/hanamisushibar`,
giữ nguyên đường dẫn. Chép đè lên repo, xoá 2 file dưới đây, commit, push. Vercel tự build.

## Phải XOÁ 2 file cũ
- `api/[...route].js`   ← quan trọng: vercel.json mới trỏ sang `api/index.js`, để file này lại cũng không hỏng nhưng gây rối
- `.DS_Store` (file rác của macOS)

## File mới / thay đổi
| File | Việc |
|---|---|
| `api/index.js` | Router mới, thay `api/[...route].js` |
| `vercel.json` | `functions` → `api/index.js`; thêm `rewrites` `/api/:route*` → `/api/index?route=:route*` |
| `lib/routes/sdp.js` | Server Direct Print: GET chẩn đoán, log `[sdp]` rõ, đọc body chắc chắn |
| `lib/receipt-epos.js`, `data/settings.js` | Phiếu 48 ký tự/dòng cho TM-m30III (80 mm); biến `RECEIPT_WIDTH` để chỉnh tạm |
| `tests/router.test.mjs`, `package.json` | Test router (7 nhóm), `npm test` chạy cả 3 file test |
| `HUONG-DAN.md`, `README.md` | Mục 5 viết lại cho TM-m30III theo đúng quy trình thực tế |
| `.gitignore` | Không commit `dist/`, `node_modules/`, `.DS_Store`, `.env` nữa |

## Cách đưa lên

**Cách A – GitHub Desktop / git trên máy (khuyên dùng)**
1. Mở thư mục repo trên máy, kéo toàn bộ nội dung thư mục này vào, chọn *Replace*.
2. Xoá `api/[...route].js` và `.DS_Store`.
3. Terminal trong thư mục repo: `npm test` → phải thấy `router.test: 7 grupper OK`.
4. Commit "Skrivare TM-m30III + api/index.js" → Push lên `main`.

**Cách B – chỉ dùng trình duyệt GitHub**
1. Repo → **Add file → Upload files** → kéo thả *các thư mục* `api`, `lib`, `data`, `tests` và các file `vercel.json`, `package.json`, `HUONG-DAN.md`, `README.md`, `.gitignore` vào → Commit.
2. Mở `api/[...route].js` trên GitHub → biểu tượng thùng rác → Commit. Làm tương tự với `.DS_Store`.

**Cách C – patch:** `git am hanami-may-in.patch` (giữ nguyên commit message).

## Sau khi Vercel build xong (≈ 1–2 phút, trạng thái Ready)
1. Trình duyệt: `https://hanamisushibar.vercel.app/api/sdp/<SDP_KEY>` → phải thấy `"ok": true` và `jobsWaiting`.
   - `Not found` → key trên Vercel (Production) khác key trong URL, hoặc chưa Redeploy.
   - Trang 404 của Vercel → bản mới chưa deploy.
2. Máy in: nút nhỏ phía sau → Feed nhanh 3 lần, giữ 1 giây → TM-i Status Sheet → `Access Test: HTTP Status Code : 200`.
3. Đặt một đơn thử → in ra trong 5–10 giây, cột **Utskriven** có giờ.

Khi trỏ xong tên miền `hanamisushibar.se`, đổi URL trên máy in sang `https://hanamisushibar.se/api/sdp/<SDP_KEY>`.
