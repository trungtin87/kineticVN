# Kinetik Studio — Kinetic Typography Video Editor

Ứng dụng tạo video Kinetic Typography từ phụ đề `.srt` và file Audio, hỗ trợ xem trước thời gian thực trên Canvas 2D và kết xuất video bằng FFmpeg (**MP4 H.264** và **MOV Apple ProRes 4444 kèm Alpha Channel 16-bit**).

## Yêu cầu hệ thống
- **Node.js** `>= 20`
- **FFmpeg** & **FFprobe** đã cài sẵn trong `PATH` (dùng để ghép frame RGBA, lặp mượt video nền và trộn âm thanh)

## Cài đặt & Chạy phát triển
```bash
npm install
npm run dev
```
Mở trình duyệt tại: `http://localhost:3000`

## Build & Chạy Production
```bash
npm run build
npm start
```

## Triển khai lên GitHub Pages qua GitHub Actions
Dự án đã tích hợp sẵn workflow `.github/workflows/deploy-pages.yml` và bộ mã hóa **FFmpeg WebAssembly** chạy trực tiếp trên trình duyệt (không cần máy chủ backend khi host trên GitHub Pages).

1. Đẩy mã nguồn lên nhánh `main` (hoặc `master`) của repository trên GitHub.
2. Vào **Settings → Pages** trên repository GitHub của bạn.
3. Ở mục **Build and deployment → Source**, chọn **GitHub Actions**.
4. Workflow **Deploy Kinetik Studio to GitHub Pages** sẽ tự động chạy (tự động nhận đúng đường dẫn `/<ten-repo>/` hoặc `/` nếu là repo `<username>.github.io`).
5. Nếu dùng custom domain trỏ thẳng vào `/`, bạn có thể thêm Repository Variable `PAGES_BASE_PATH=/` trong **Settings → Secrets and variables → Actions → Variables**.

