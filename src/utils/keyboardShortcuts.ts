export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  id: string;
  title: string;
  accent: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'playback',
    title: 'Điều khiển & Phát lại',
    accent: '#FF5A1F',
    items: [
      { keys: ['Space'], description: 'Phát / Tạm dừng video' },
      { keys: ['←', '→'], description: 'Lùi / Tới 1 frame (1/30s)' },
      { keys: ['Shift', '← / →'], description: 'Tua nhanh lùi / tới 0.5 giây' },
      { keys: ['L'], description: 'Bật / Tắt phát lặp lại' },
      { keys: ['M'], description: 'Tắt / Bật âm thanh xem trước' },
    ],
  },
  {
    id: 'cues',
    title: 'Biên tập câu & Phụ đề',
    accent: '#34D399',
    items: [
      { keys: ['↑', '↓'], description: 'Chọn câu trước / câu tiếp theo' },
      { keys: ['[', ']'], description: 'Nhảy nhanh sang câu trước / sau' },
      { keys: ['N'], description: 'Thêm câu phụ đề mới ở cuối' },
      { keys: ['S'], description: 'Tách đôi câu đang chọn tại đầu phát' },
      { keys: ['J'], description: 'Gộp câu đang chọn với câu kế tiếp' },
      { keys: ['Delete'], description: 'Xóa câu phụ đề đang chọn' },
      { keys: ['Ctrl', 'E'], description: 'Bọc / Bỏ [nhấn mạnh] khi đang gõ chữ' },
    ],
  },
  {
    id: 'stage',
    title: 'Khung hình & Safe Zone',
    accent: '#38BDF8',
    items: [
      { keys: ['F'], description: 'Xem toàn màn hình tối ưu (hoặc chạm đúp khung phát)' },
      { keys: ['G'], description: 'Bật / Tắt lưới an toàn & Safe Zone' },
      { keys: ['T'], description: 'Định tâm chữ vào vùng Safe Zone TikTok (9:16)' },
      { keys: ['1', '2', '3'], description: 'Chuyển tab Câu / Font & Hiệu ứng / Nền động' },
    ],
  },
  {
    id: 'system',
    title: 'Dự án & Hệ thống',
    accent: '#A78BFA',
    items: [
      { keys: ['Ctrl', 'Z'], description: 'Hoàn tác thao tác vừa rồi' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Làm lại (hoặc Ctrl + Y)' },
      { keys: ['Ctrl', 'I'], description: 'Mở bảng Soạn nội dung nhanh / Nhập SRT' },
      { keys: ['Ctrl', 'S'], description: 'Lưu dự án ra file (.kinetik.json)' },
      { keys: ['Ctrl', 'Shift', 'E'], description: 'Mở hộp thoại Xuất Video' },
      { keys: ['?'], description: 'Mở / Đóng bảng phím tắt này (hoặc F1)' },
      { keys: ['Esc'], description: 'Đóng hộp thoại đang mở' },
    ],
  },
];
