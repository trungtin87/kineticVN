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
