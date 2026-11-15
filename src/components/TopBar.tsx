import React from 'react';
import { Download, FileCode2, FolderUp, RotateCcw } from 'lucide-react';
import { AspectRatioId, ASPECT_RATIOS } from '../types/studio';
import { PWAInstallButton } from './PWAInstallButton';

export type InspectorTab = 'cue' | 'typography' | 'background';

interface TopBarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  aspectRatio: AspectRatioId;
  onAspectRatioChange: (ratio: AspectRatioId) => void;
  onOpenImport: () => void;
  onResetDemo: () => void;
  onOpenExport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  onProjectNameChange,
  activeTab,
  onTabChange,
  aspectRatio,
  onAspectRatioChange,
  onOpenImport,
  onResetDemo,
  onOpenExport,
}) => {
  return (
    <header className="h-12 lg:h-14 px-3 lg:px-5 bg-[#111318] border-b border-white/8 flex items-center justify-between gap-3 lg:gap-8 shrink-0">
      {/* Zone 1: Single-line Brand Wordmark */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <span className="font-display text-sm lg:text-base font-bold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0">
          Kinetik Studio
        </span>
        <span className="hidden md:inline text-white/15 select-none" aria-hidden="true">
          /
        </span>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          aria-label="Tên dự án"
          className="hidden md:block bg-transparent text-sm text-[#A1A8B8] hover:text-[#F4F5F7] focus:text-[#F4F5F7] focus:outline-none border-b border-transparent focus:border-[#FF5A1F] px-1 py-0.5 w-36 lg:w-44 truncate transition-colors"
        />
      </div>

      {/* Zone 2: Single-line Desktop Workspace Navigation Links */}
      <nav className="hidden lg:flex items-center gap-6" aria-label="Studio workspace sections">
        <button
          type="button"
          onClick={() => onTabChange('cue')}
          className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'cue'
              ? 'text-[#F4F5F7] border-[#FF5A1F]'
              : 'text-[#8E95A5] border-transparent hover:text-[#F4F5F7]'
          }`}
        >
          Câu &amp; Nhấn chữ
        </button>
        <button
          type="button"
          onClick={() => onTabChange('typography')}
          className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'typography'
              ? 'text-[#F4F5F7] border-[#FF5A1F]'
              : 'text-[#8E95A5] border-transparent hover:text-[#F4F5F7]'
          }`}
        >
          Font &amp; Hiệu ứng
        </button>
        <button
          type="button"
          onClick={() => onTabChange('background')}
          className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'background'
              ? 'text-[#F4F5F7] border-[#FF5A1F]'
              : 'text-[#8E95A5] border-transparent hover:text-[#F4F5F7]'
          }`}
        >
          Nền động &amp; Video
        </button>
        <button
          type="button"
          onClick={onOpenImport}
          className="text-sm font-medium text-[#8E95A5] hover:text-[#F4F5F7] whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <FolderUp className="w-3.5 h-3.5" />
          <span>Nhập SRT / Audio</span>
        </button>
      </nav>

      {/* Zone 3: Aspect Ratio, PWA Install & Primary Export CTA */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
        <select
          value={aspectRatio}
          onChange={(e) => onAspectRatioChange(e.target.value as AspectRatioId)}
          aria-label="Tỉ lệ khung hình"
          className="bg-[#181B23] text-xs font-medium text-[#E2E5EC] border border-white/10 rounded-md px-2 lg:px-2.5 py-1.5 lg:py-2 focus:outline-none focus:border-[#FF5A1F] cursor-pointer whitespace-nowrap shrink-0"
        >
          {(Object.keys(ASPECT_RATIOS) as AspectRatioId[]).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>

        <PWAInstallButton />

        {import.meta.env.VITE_STATIC_HOST !== 'true' && (
          <a
            href="/api/export-source"
            download="kinetik-studio-source.zip"
            title="Tải toàn bộ mã nguồn (.zip)"
            aria-label="Tải toàn bộ mã nguồn"
            className="flex p-2 text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <FileCode2 className="w-4 h-4" />
          </a>
        )}

        <button
          type="button"
          onClick={onResetDemo}
          title="Khôi phục dự án mẫu"
          className="hidden sm:flex p-2 text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="px-3 lg:px-4 py-1.5 lg:py-2 min-h-[36px] bg-[#FF5A1F] hover:bg-[#E84D14] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 lg:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất Video</span>
        </button>
      </div>
    </header>
  );
};
