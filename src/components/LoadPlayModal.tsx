import React, { useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, Search, Trash2, Upload, X } from 'lucide-react';
import {
  exportPlaysToJsonFile,
  getCategoryLabel,
  importPlaysFromJsonText,
  PLAY_CATEGORIES,
} from '../lib/storage';
import { PlayCategory, PlayData } from '../types';

interface LoadPlayModalProps {
  savedPlays: PlayData[];
  currentPlayId: string | null;
  getCurrentPlayData: () => PlayData;
  onLoad: (play: PlayData) => void;
  onDelete: (id: string) => void;
  onPlaysUpdated: (plays: PlayData[]) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export const LoadPlayModal: React.FC<LoadPlayModalProps> = ({
  savedPlays,
  currentPlayId,
  getCurrentPlayData,
  onLoad,
  onDelete,
  onPlaysUpdated,
  onToast,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | PlayCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPlays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return savedPlays.filter((play) => {
      if (selectedCategory !== 'all' && (play.category ?? 'offense') !== selectedCategory) {
        return false;
      }
      if (q) {
        const inName = play.name.toLowerCase().includes(q);
        const inNotes = play.frames.some((f) => (f.note ?? '').toLowerCase().includes(q));
        if (!inName && !inNotes) return false;
      }
      return true;
    });
  }, [savedPlays, selectedCategory, searchQuery]);

  const handleExportAll = () => {
    if (savedPlays.length === 0) {
      onToast('書き出す保存済みプレイがありません');
      return;
    }
    exportPlaysToJsonFile(savedPlays, 'pro_playbook_all');
    onToast(`${savedPlays.length}件のプレイをJSONで書き出しました`);
  };

  const handleExportCurrent = () => {
    const current = getCurrentPlayData();
    exportPlaysToJsonFile([current], current.name || 'play');
    onToast(`「${current.name}」をJSONで書き出しました`);
  };

  const handleExportSingle = (play: PlayData) => {
    exportPlaysToJsonFile([play], play.name || 'play');
    onToast(`「${play.name}」をJSONで書き出しました`);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = importPlaysFromJsonText(text);
      if (!result.ok) {
        onToast(result.error || 'JSON読み込みに失敗しました');
        return;
      }
      onPlaysUpdated(result.plays);
      onToast(`${result.importedCount}件のプレイを読み込みました`);
    } catch {
      onToast('ファイルの読み込みに失敗しました');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[86vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <FolderOpen className="text-orange-600" size={20} /> プレイ管理・バックアップ
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-full transition"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70 space-y-2.5 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="プレイ名や戦術メモで検索..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                selectedCategory === 'all'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              すべて ({savedPlays.length})
            </button>
            {PLAY_CATEGORIES.map((cat) => {
              const count = savedPlays.filter((p) => (p.category ?? 'offense') === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                    selectedCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Saved Plays List */}
        <div className="flex-1 overflow-y-auto p-2.5">
          {filteredPlays.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">
              {savedPlays.length === 0
                ? '保存されているプレイはありません'
                : '条件に一致するプレイが見つかりませんでした'}
            </p>
          ) : (
            filteredPlays.map((play) => (
              <div
                key={play.id}
                className={`flex justify-between items-center p-3 border-b border-gray-100 hover:bg-orange-50/60 transition rounded-lg ${
                  play.id === currentPlayId ? 'bg-orange-50/50 ring-1 ring-orange-200' : ''
                }`}
              >
                <button
                  type="button"
                  className="text-left cursor-pointer flex-1 min-w-0 pr-2"
                  onClick={() => onLoad(play)}
                >
                  <div className="font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{play.name}</span>
                    <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium shrink-0">
                      {getCategoryLabel(play.category)}
                    </span>
                    <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded shrink-0">
                      {play.courtType === 'full' ? 'フル' : 'ハーフ'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {play.date} ・ {play.frames.length} フレーム
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleExportSingle(play)}
                    className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-md transition"
                    title="このプレイをJSONで書き出す"
                    aria-label={`${play.name} をJSON書き出し`}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(play.id)}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-md transition"
                    title="削除"
                    aria-label={`${play.name} を削除`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* JSON Backup / Import Footer */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50 rounded-b-xl flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCurrent}
              className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
              title="現在編集中のプレイを1ファイルとしてJSON出力"
            >
              <Download size={14} /> 編集中のJSON出力
            </button>
            <button
              type="button"
              onClick={handleExportAll}
              disabled={savedPlays.length === 0}
              className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
              title="保存済みプレイをまとめてバックアップ出力"
            >
              <Download size={14} /> 一括バックアップ
            </button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileImport}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
            >
              <Upload size={14} /> JSON読込
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
