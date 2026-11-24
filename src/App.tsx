import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowRightFromLine,
  BookOpen,
  Eraser,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  Loader2,
  Magnet,
  MessageSquareText,
  Minus,
  MousePointer2,
  MoveDown,
  Play,
  Plus,
  Redo2,
  Repeat,
  Save,
  Square,
  Target,
  Trash2,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import { FormationModal } from './components/FormationModal';
import { LoadPlayModal } from './components/LoadPlayModal';
import { FormationTemplate } from './lib/formations';
import { PlaybookCore } from './lib/playbook-core';
import {
  deletePlayFromStorage,
  loadPlaysFromStorage,
  PLAY_CATEGORIES,
  upsertPlayInStorage,
} from './lib/storage';
import { CourtType, PlaybookState, PlayCategory, PlayData, ToolMode } from './types';

const BasketballIcon = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M5.4 5.4l13.2 13.2" />
    <path d="M12 2v20" />
    <path d="M2 12h20" />
    <path d="M5.4 18.6L18.6 5.4" />
  </svg>
);

const LINE_COLORS: { hex: string; label: string }[] = [
  { hex: '#1f2937', label: '黒（基本）' },
  { hex: '#dc2626', label: '赤（第1オプション）' },
  { hex: '#2563eb', label: '青（カウンター）' },
  { hex: '#15803d', label: '緑（守備・連動）' },
];

const OFFENSE_LABEL_PRESETS = ['1', '2', '3', '4', '5', 'PG', 'SG', 'SF', 'PF', 'C'];
const DEFENSE_LABEL_PRESETS = ['×', 'X1', 'X2', 'X3', 'X4', 'X5'];

const INITIAL_STATE: PlaybookState = {
  framesCount: 1,
  currentFrameIndex: 0,
  frameHasNotes: [false],
  currentFrameNote: '',
  mode: 'select',
  lineColor: '#1f2937',
  playName: '新しいプレイ',
  category: 'offense',
  currentPlayId: null,
  courtType: 'half',
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  selectedObjectInfo: null,
  selectedLineColor: null,
  isPlaying: false,
  loopPlayback: false,
  playbackSpeed: 1,
  carryOverLines: false,
  showOnionSkin: false,
  ballFollowsPlayer: true,
  snapToObjects: true,
  currentFrameLinesCount: 0,
  isExporting: false,
  exportProgress: 0,
  exportStatusText: '',
};

type ModalType = '' | 'help' | 'save' | 'load' | 'clear' | 'formations';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<PlaybookCore | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [state, setState] = useState<PlaybookState>(INITIAL_STATE);
  const [statusMsg, setStatusMsg] = useState('');
  const [activeModal, setActiveModal] = useState<ModalType>('');
  const [savedPlays, setSavedPlays] = useState<PlayData[]>([]);
  const [saveNameInput, setSaveNameInput] = useState('');
  const [saveCategoryInput, setSaveCategoryInput] = useState<PlayCategory>('offense');

  const showToast = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setStatusMsg('');
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;

    const core = new PlaybookCore(
      canvasRef.current,
      wrapperRef.current,
      (newState) => setState(newState),
      showToast
    );
    coreRef.current = core;

    return () => {
      core.destroy();
      coreRef.current = null;
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [showToast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeModal) {
          setActiveModal('');
        } else {
          coreRef.current?.clearSelection();
        }
        return;
      }

      if (activeModal) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          coreRef.current?.redo();
        } else {
          coreRef.current?.undo();
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        coreRef.current?.redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.hasSelection) {
          e.preventDefault();
          coreRef.current?.deleteSelection();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        coreRef.current?.togglePlayback();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        coreRef.current?.stepFrame(-1);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        coreRef.current?.stepFrame(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, state.hasSelection]);

  const handleTool = (t: ToolMode) => coreRef.current?.setTool(t);

  // --- Save / Load Modals ---
  const openSaveModal = () => {
    setSaveNameInput(state.playName);
    setSaveCategoryInput(state.category);
    setSavedPlays(loadPlaysFromStorage());
    setActiveModal('save');
  };

  const openLoadModal = () => {
    setSavedPlays(loadPlaysFromStorage());
    setActiveModal('load');
  };

  const canOverwriteCurrent =
    state.currentPlayId !== null && savedPlays.some((p) => p.id === state.currentPlayId);

  const execSavePlay = (overwrite: boolean) => {
    const trimmed = saveNameInput.trim();
    if (!trimmed || !coreRef.current) {
      showToast('プレイ名を入力してください');
      return;
    }

    const data = coreRef.current.getPlayDataToSave(trimmed, saveCategoryInput);
    const result = upsertPlayInStorage(data, overwrite);
    if (!result.ok) {
      showToast(result.error || '保存に失敗しました');
      return;
    }

    coreRef.current.markSavedPlayId(
      result.savedPlay.id,
      result.savedPlay.name,
      result.savedPlay.category ?? saveCategoryInput
    );
    setSavedPlays(result.plays);
    setActiveModal('');
    showToast(overwrite ? 'プレイを上書き保存しました' : '新しいプレイとして保存しました');
  };

  const deletePlay = (id: string) => {
    const result = deletePlayFromStorage(id);
    if (!result.ok) {
      showToast(result.error || '削除に失敗しました');
      return;
    }
    setSavedPlays(result.plays);
    showToast('保存済みプレイを削除しました');
  };

  const executeClearFrame = () => {
    coreRef.current?.clearFrame();
    setActiveModal('');
  };

  const controlsDisabled = state.isPlaying || state.isExporting;
  const activeColor = state.selectedLineColor ?? state.lineColor;

  const toolItems: { mode: ToolMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'select', label: '編集', icon: <MousePointer2 size={16} className="mb-0.5" /> },
    { mode: 'move', label: '移動', icon: <ArrowRight size={16} className="mb-0.5" /> },
    { mode: 'pass', label: 'パス', icon: <Minus size={16} className="mb-0.5" /> },
    { mode: 'dribble', label: 'ドリブル', icon: <Activity size={16} className="mb-0.5" /> },
    { mode: 'screen', label: 'スクリーン', icon: <MoveDown size={16} className="mb-0.5" /> },
    { mode: 'shoot', label: 'シュート', icon: <Target size={16} className="mb-0.5" /> },
  ];

  const isPlayerSelected =
    state.selectedObjectInfo !== null && state.selectedObjectInfo.type !== 'Ball';

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-100 text-gray-800 font-sans">
      {/* Responsive Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 z-20 pt-safe pl-safe pr-safe">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:h-14 md:py-0 md:px-4">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
            <div className="bg-orange-600 text-white w-8 h-8 rounded-md flex items-center justify-center shrink-0 shadow-sm">
              <BasketballIcon size={18} />
            </div>

            <input
              type="text"
              aria-label="プレイ名"
              disabled={controlsDisabled}
              className="font-bold text-sm md:text-base text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-orange-500 focus:outline-none min-w-0 w-32 sm:w-44 md:w-56 px-1 transition disabled:opacity-60"
              value={state.playName}
              onChange={(e) => coreRef.current?.setPlayName(e.target.value)}
              onBlur={() => coreRef.current?.commitPlayName()}
              placeholder="プレイ名を入力"
            />

            <select
              aria-label="コート種別"
              disabled={controlsDisabled}
              value={state.courtType}
              onChange={(e) => coreRef.current?.setCourtType(e.target.value as CourtType)}
              className="text-xs md:text-sm border border-gray-300 rounded-md px-2 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer hover:bg-white transition-colors disabled:opacity-50 shrink-0"
            >
              <option value="half">ハーフコート</option>
              <option value="full">フルコート</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setActiveModal('help')}
              className="text-gray-500 hover:text-orange-600 p-1.5 rounded-md hover:bg-gray-100 transition"
              title="使い方"
              aria-label="使い方"
            >
              <HelpCircle size={19} />
            </button>

            <div className="hidden sm:block h-5 w-px bg-gray-200 mx-0.5" />

            <button
              disabled={controlsDisabled}
              onClick={openSaveModal}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition flex items-center gap-1.5 disabled:opacity-40"
              title="保存"
            >
              <Save size={15} />
              <span className="hidden sm:inline">保存</span>
            </button>

            <button
              disabled={controlsDisabled}
              onClick={openLoadModal}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition flex items-center gap-1.5 disabled:opacity-40"
              title="読込・JSONバックアップ"
            >
              <FolderOpen size={15} />
              <span className="hidden sm:inline">読込</span>
            </button>

            <div className="hidden md:flex bg-gray-100 rounded-md py-1 px-2.5 items-center text-xs text-gray-600 font-mono tabular-nums">
              {state.currentFrameIndex + 1} / {state.framesCount || 1}
            </div>

            <button
              disabled={controlsDisabled}
              onClick={() => coreRef.current?.exportPDF()}
              className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition flex items-center gap-1.5 shadow-sm disabled:opacity-40"
              title="PDF出力"
            >
              <FileText size={15} />
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              disabled={controlsDisabled || state.framesCount < 2}
              onClick={() => coreRef.current?.exportVideo()}
              className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition flex items-center gap-1.5 shadow-sm disabled:opacity-40"
              title={state.framesCount < 2 ? '動画出力には2フレーム以上必要です' : 'MP4出力'}
            >
              <Video size={15} />
              <span className="hidden sm:inline">MP4</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className="w-16 md:w-20 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-3 shrink-0 z-10 overflow-y-auto pl-safe">
          {/* Add Players / Ball / Formations */}
          <div className="flex flex-col gap-2 w-full px-1.5">
            <button
              disabled={controlsDisabled}
              onClick={() => coreRef.current?.addPlayer('O')}
              className="flex flex-col items-center gap-1 group hover:scale-105 transition-transform disabled:opacity-40"
              title="攻撃選手を追加"
            >
              <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-sm shadow-sm border-2 border-white ring-1 ring-gray-200">
                1
              </div>
              <span className="text-[10px] text-gray-600 font-medium">攻撃</span>
            </button>

            <button
              disabled={controlsDisabled}
              onClick={() => coreRef.current?.addPlayer('X')}
              className="flex flex-col items-center gap-1 group hover:scale-105 transition-transform disabled:opacity-40"
              title="守備選手を追加"
            >
              <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-base shadow-sm border-2 border-white ring-1 ring-gray-200">
                ×
              </div>
              <span className="text-[10px] text-gray-600 font-medium">守備</span>
            </button>

            <button
              disabled={controlsDisabled}
              onClick={() => coreRef.current?.addBall()}
              className="flex flex-col items-center gap-1 group hover:scale-105 transition-transform disabled:opacity-40"
              title="ボールを追加"
            >
              <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-sm border border-white">
                <BasketballIcon size={14} />
              </div>
              <span className="text-[10px] text-gray-600 font-medium">ボール</span>
            </button>

            <button
              disabled={controlsDisabled}
              onClick={() => setActiveModal('formations')}
              className="mt-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition disabled:opacity-40"
              title="定番フォーメーションをワンタップ配置"
            >
              <LayoutGrid size={16} />
              <span className="text-[9px] font-bold leading-none mt-0.5">定型配置</span>
            </button>
          </div>

          <div className="w-8 h-px bg-gray-200 shrink-0" />

          {/* Undo / Redo */}
          <div className="flex items-center justify-center gap-1 w-full px-1">
            <button
              disabled={!state.canUndo || controlsDisabled}
              onClick={() => coreRef.current?.undo()}
              className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-1.5 rounded-md flex flex-col items-center transition disabled:opacity-30 disabled:pointer-events-none"
              title="元に戻す (Ctrl+Z)"
              aria-label="元に戻す"
            >
              <Undo2 size={16} />
            </button>
            <button
              disabled={!state.canRedo || controlsDisabled}
              onClick={() => coreRef.current?.redo()}
              className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-1.5 rounded-md flex flex-col items-center transition disabled:opacity-30 disabled:pointer-events-none"
              title="やり直す (Ctrl+Shift+Z)"
              aria-label="やり直す"
            >
              <Redo2 size={16} />
            </button>
          </div>

          <div className="w-8 h-px bg-gray-200 shrink-0" />

          {/* Drawing Tools */}
          <div className="flex flex-col gap-1 w-full px-1">
            {toolItems.map((tool) => (
              <button
                key={tool.mode}
                disabled={controlsDisabled}
                onClick={() => handleTool(tool.mode)}
                className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all disabled:opacity-40 ${
                  state.mode === tool.mode
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={tool.label}
              >
                {tool.icon}
                <span className="text-[9px] leading-none font-medium mt-0.5">{tool.label}</span>
              </button>
            ))}
          </div>

          <div className="w-8 h-px bg-gray-200 shrink-0" />

          {/* Delete & Clear */}
          <button
            disabled={!state.hasSelection || controlsDisabled}
            onClick={() => coreRef.current?.deleteSelection()}
            className={`p-1.5 flex flex-col items-center transition-colors ${
              state.hasSelection && !controlsDisabled
                ? 'text-red-600 hover:text-red-700 cursor-pointer'
                : 'text-gray-400 opacity-40 pointer-events-none'
            }`}
            title="選択を削除 (Delete)"
          >
            <Trash2 size={18} className="mb-0.5" />
            <span className="text-[9px] font-bold">削除</span>
          </button>

          <button
            disabled={controlsDisabled}
            onClick={() => setActiveModal('clear')}
            className="text-gray-500 hover:text-red-600 p-1.5 flex flex-col items-center cursor-pointer pb-6 transition disabled:opacity-40"
            title="現在のフレームを全消去"
          >
            <Eraser size={18} className="mb-0.5" />
            <span className="text-[9px]">全消去</span>
          </button>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col bg-gray-200 relative overflow-hidden pr-safe">
          {/* Context Properties & Assist Bar */}
          <div className="bg-white/95 border-b border-gray-200 px-3 py-1.5 flex items-center justify-between gap-3 overflow-x-auto hide-scrollbar shrink-0 z-10 text-xs">
            <div className="flex items-center gap-3 shrink-0">
              {/* Line Color Picker */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 font-medium whitespace-nowrap">ライン色:</span>
                {LINE_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => coreRef.current?.setLineColor(c.hex)}
                    className={`w-5 h-5 rounded-full transition-transform disabled:opacity-40 ${
                      activeColor === c.hex
                        ? 'ring-2 ring-offset-1 ring-orange-500 scale-110'
                        : 'hover:scale-110 ring-1 ring-gray-300'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                    aria-label={c.label}
                  />
                ))}
              </div>

              {/* Player Label Editor (shown when an Offense or Defense player is selected) */}
              {isPlayerSelected && state.selectedObjectInfo && (
                <>
                  <div className="w-px h-5 bg-gray-200 shrink-0" />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-orange-700 font-bold whitespace-nowrap">
                      {state.selectedObjectInfo.type === 'O' ? '攻撃ラベル:' : '守備ラベル:'}
                    </span>
                    <input
                      type="text"
                      maxLength={4}
                      disabled={controlsDisabled}
                      value={state.selectedObjectInfo.label}
                      onChange={(e) => coreRef.current?.setSelectedObjectLabel(e.target.value, false)}
                      onBlur={() => coreRef.current?.commitSelectedObjectLabel()}
                      className="w-14 px-1.5 py-0.5 text-xs font-bold text-center border border-orange-300 rounded bg-orange-50/40 focus:outline-none focus:border-orange-500"
                      placeholder="1"
                    />
                    <div className="flex items-center gap-1">
                      {(state.selectedObjectInfo.type === 'O'
                        ? OFFENSE_LABEL_PRESETS
                        : DEFENSE_LABEL_PRESETS
                      ).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={controlsDisabled}
                          onClick={() => coreRef.current?.setSelectedObjectLabel(preset, true)}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition ${
                            state.selectedObjectInfo?.label === preset
                              ? 'bg-orange-600 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Assist Toggles: Ball Follow & Snap */}
            <div className="flex items-center gap-2 shrink-0">
              <label
                className={`flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer select-none transition ${
                  state.ballFollowsPlayer
                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
                title="選手をドラッグしたとき、近くにあるボールも一緒に追従移動します"
              >
                <input
                  type="checkbox"
                  checked={state.ballFollowsPlayer}
                  onChange={(e) => coreRef.current?.setBallFollowsPlayer(e.target.checked)}
                  className="sr-only"
                />
                <BasketballIcon size={12} />
                <span className="font-medium whitespace-nowrap">ボール追従</span>
              </label>

              <label
                className={`flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer select-none transition ${
                  state.snapToObjects
                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
                title="ライン描画時に選手・ボール・リングへ自動でスナップ吸着します"
              >
                <input
                  type="checkbox"
                  checked={state.snapToObjects}
                  onChange={(e) => coreRef.current?.setSnapToObjects(e.target.checked)}
                  className="sr-only"
                />
                <Magnet size={12} />
                <span className="font-medium whitespace-nowrap">スナップ</span>
              </label>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 flex items-center justify-center p-2.5 w-full min-h-0" ref={wrapperRef}>
            <div
              className="relative shadow-xl bg-white rounded-sm overflow-hidden ring-1 ring-gray-900/5"
              style={{ fontSize: 0 }}
            >
              <canvas ref={canvasRef} className="mx-auto block bg-[#eaddcf]" />

              {/* Live Playback Subtitle Overlay */}
              {state.isPlaying && state.currentFrameNote.trim() && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[92%] bg-slate-900/85 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-xs md:text-sm font-medium text-center shadow-lg border border-white/10 pointer-events-none z-30 leading-snug">
                  {state.currentFrameNote}
                </div>
              )}

              {/* Export Progress Overlay */}
              {state.isExporting && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50 px-6 text-center">
                  <Loader2 className="animate-spin text-orange-500 mb-3" size={44} />
                  <h2 className="text-lg font-bold">{state.exportStatusText}</h2>
                  <div className="w-56 bg-gray-700 h-2 rounded mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-full transition-all duration-100"
                      style={{ width: `${state.exportProgress}%` }}
                    />
                  </div>
                  <p className="text-xs mt-2 text-gray-300 font-mono">
                    {Math.round(state.exportProgress)}%
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Frame Tactical Note Bar */}
          <div className="bg-white border-t border-gray-200 px-3 md:px-4 py-1.5 flex items-center gap-2 shrink-0 z-20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700 shrink-0">
              <MessageSquareText size={14} />
              <span>Frame {state.currentFrameIndex + 1} メモ</span>
            </div>
            <input
              type="text"
              disabled={controlsDisabled}
              value={state.currentFrameNote}
              onChange={(e) => coreRef.current?.setCurrentFrameNote(e.target.value)}
              onBlur={() => coreRef.current?.commitCurrentFrameNote()}
              placeholder="戦術ポイントや指導メモを入力（PDF・再生字幕・MP4に反映されます）"
              className="flex-1 min-w-0 text-xs md:text-sm bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 focus:outline-none focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition disabled:opacity-60"
            />
          </div>

          {/* Timeline Bar */}
          <div className="min-h-[74px] bg-white border-t border-gray-100 shrink-0 flex items-center px-3 md:px-4 gap-2.5 overflow-x-auto z-20 pb-safe">
            {/* Play / Stop, Loop & Speed */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                disabled={state.isExporting || (!state.isPlaying && state.framesCount < 2)}
                onClick={() => coreRef.current?.togglePlayback()}
                className={`w-10 h-10 rounded-full text-white flex items-center justify-center hover:scale-105 active:scale-95 transition shrink-0 shadow-md disabled:opacity-40 ${
                  state.isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-800 hover:bg-slate-700'
                }`}
                title={state.isPlaying ? '再生を停止 (Space)' : 'アニメーション再生 (Space)'}
                aria-label={state.isPlaying ? '再生を停止' : '再生'}
              >
                {state.isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={16} className="ml-0.5" />}
              </button>

              <button
                disabled={state.isExporting}
                onClick={() => coreRef.current?.setLoopPlayback(!state.loopPlayback)}
                className={`p-2 rounded-md transition disabled:opacity-40 ${
                  state.loopPlayback
                    ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={state.loopPlayback ? 'ループ再生: オン' : 'ループ再生: オフ'}
                aria-label="ループ再生切替"
              >
                <Repeat size={15} />
              </button>

              <button
                disabled={state.isExporting}
                onClick={() => coreRef.current?.cyclePlaybackSpeed()}
                className="px-2 py-1 text-xs font-mono font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition disabled:opacity-40"
                title="再生速度を切り替え"
              >
                {state.playbackSpeed}x
              </button>
            </div>

            <div className="w-px h-9 bg-gray-200 shrink-0" />

            {/* Frame List */}
            <div className="flex gap-2 items-center">
              {Array.from({ length: state.framesCount }).map((_, idx) => (
                <div
                  key={idx}
                  onClick={() => coreRef.current?.switchFrame(idx)}
                  className={`relative min-w-[56px] h-[46px] flex items-center justify-center border-2 rounded-md font-bold transition-colors cursor-pointer group select-none touch-pan-x ${
                    idx === state.currentFrameIndex
                      ? 'border-orange-500 text-orange-600 bg-orange-50'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                  } ${controlsDisabled ? 'pointer-events-none opacity-80' : ''}`}
                >
                  <span className="font-mono text-sm">{idx + 1}</span>
                  {state.frameHasNotes[idx] && (
                    <span
                      className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-500"
                      title="戦術メモあり"
                    />
                  )}
                  {state.framesCount > 1 && !controlsDisabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        coreRef.current?.deleteFrame(idx);
                      }}
                      className={`absolute -top-2 -right-2 w-[18px] h-[18px] bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-opacity shadow-sm ${
                        idx === state.currentFrameIndex
                          ? 'opacity-100'
                          : 'opacity-80 md:opacity-0 md:group-hover:opacity-100'
                      }`}
                      title={`フレーム ${idx + 1} を削除`}
                      aria-label={`フレーム ${idx + 1} を削除`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Advance Along Lines + Add Frame + Options */}
            <button
              disabled={controlsDisabled || state.currentFrameLinesCount === 0}
              onClick={() => coreRef.current?.advanceFrameAlongLines()}
              className={`h-[46px] px-3 flex items-center justify-center gap-1.5 rounded-md transition shrink-0 text-xs font-bold shadow-sm disabled:opacity-40 ${
                state.currentFrameLinesCount > 0 && !controlsDisabled
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}
              title={
                state.currentFrameLinesCount > 0
                  ? '現在の矢印の終点へ選手・ボールを自動移動して次のフレームを作成します'
                  : '矢印を描くと、終点へ自動移動して次フレームを作成できます'
              }
            >
              <ArrowRightFromLine size={16} />
              <span>矢印先へ展開</span>
            </button>

            <button
              disabled={controlsDisabled}
              onClick={() => coreRef.current?.addFrame()}
              className="h-[46px] px-3 flex items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-md hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 text-gray-500 transition shrink-0 text-xs font-medium disabled:opacity-40"
              title="現在の配置をコピーして新しいフレームを追加"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">複製追加</span>
            </button>

            <div className="flex flex-col gap-1 shrink-0 ml-1">
              <label
                className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none"
                title="オンにすると複製追加時に矢印ラインもコピーします"
              >
                <input
                  type="checkbox"
                  checked={state.carryOverLines}
                  onChange={(e) => coreRef.current?.setCarryOverLines(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span>ライン引継</span>
              </label>

              <label
                className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none"
                title="オンにすると1つ前のフレームの配置を薄く重ねて表示します"
              >
                <input
                  type="checkbox"
                  checked={state.showOnionSkin}
                  onChange={(e) => coreRef.current?.setShowOnionSkin(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span>前フレーム残像</span>
              </label>
            </div>
          </div>

          {/* Status Toast */}
          <div
            role="status"
            aria-live="polite"
            className={`absolute top-12 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur text-white px-5 py-2 rounded-lg text-xs md:text-sm font-medium z-50 shadow-lg border border-white/10 transition-opacity duration-200 whitespace-nowrap ${
              statusMsg ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {statusMsg}
          </div>
        </main>
      </div>

      {/* Formation Picker Modal */}
      {activeModal === 'formations' && (
        <FormationModal
          onSelect={(template: FormationTemplate, mode: 'replace' | 'append') => {
            coreRef.current?.applyFormation(template, mode);
            setActiveModal('');
          }}
          onClose={() => setActiveModal('')}
        />
      )}

      {/* Load & JSON Backup Modal */}
      {activeModal === 'load' && coreRef.current && (
        <LoadPlayModal
          savedPlays={savedPlays}
          currentPlayId={state.currentPlayId}
          getCurrentPlayData={() => coreRef.current!.getPlayDataToSave()}
          onLoad={(play) => {
            coreRef.current?.loadPlayData(play);
            setActiveModal('');
          }}
          onDelete={deletePlay}
          onPlaysUpdated={(plays) => setSavedPlays(plays)}
          onToast={showToast}
          onClose={() => setActiveModal('')}
        />
      )}

      {/* Help Modal */}
      {activeModal === 'help' && (
        <div
          onClick={() => setActiveModal('')}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
          >
            <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <BookOpen className="text-orange-600" size={20} /> 使い方ガイド
              </h3>
              <button
                onClick={() => setActiveModal('')}
                className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-full transition"
                aria-label="閉じる"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-5 text-sm text-gray-600">
              <div>
                <h4 className="font-bold text-orange-600 mb-2 flex items-center gap-1.5">
                  <MousePointer2 size={16} /> 作図・編集のコツ
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>定型配置:</strong> サイドバーの「定型配置」から 5-Out・Horns・2-3ゾーン等をワンタップで並べられます。
                  </li>
                  <li>
                    <strong>矢印先へ自動展開:</strong> 矢印を引いたあと「矢印先へ展開」を押すと、選手とボールを自動で終点に移動した次フレームを作成できます。
                  </li>
                  <li>
                    <strong>選手ラベル＆ライン色分け:</strong> 選手を選択すると上部バーから番号・ポジション（PG/C/X1等）を編集でき、ラインの色も4色で切り替えられます。
                  </li>
                  <li>
                    <strong>ボール追従＆スナップ:</strong> 選手を動かすと近くのボールが自動で追従し、ライン描画時は選手やリングへ吸着します。
                  </li>
                  <li>
                    <strong>戦術メモ:</strong> 各フレームのメモは、再生時の字幕・PDF出力・MP4動画に自動反映されます。
                  </li>
                  <li>
                    <strong>バックアップ＆共有:</strong> 「読込」画面からカテゴリ絞り込み・検索、JSON形式での書き出し／読み込みができます。
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-orange-600 mb-2 flex items-center gap-1.5">
                  <ArrowRight size={16} /> ラインツール
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <ArrowRight size={14} /> 移動（実線）
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <Minus size={14} /> パス（破線）
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <Activity size={14} /> ドリブル（波線）
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <MoveDown size={14} /> スクリーン（T字）
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <Target size={14} /> シュート（点線）
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-orange-600 mb-2">ショートカットキー</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>元に戻す</span>
                    <kbd className="font-mono font-bold text-gray-700">Ctrl/⌘ + Z</kbd>
                  </div>
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>やり直す</span>
                    <kbd className="font-mono font-bold text-gray-700">Ctrl/⌘ + Shift + Z</kbd>
                  </div>
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>コマ送り（前後）</span>
                    <kbd className="font-mono font-bold text-gray-700">← / →</kbd>
                  </div>
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>再生 / 停止</span>
                    <kbd className="font-mono font-bold text-gray-700">Space</kbd>
                  </div>
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>選択を削除</span>
                    <kbd className="font-mono font-bold text-gray-700">Delete / BS</kbd>
                  </div>
                  <div className="bg-gray-50 p-2 rounded flex justify-between">
                    <span>選択解除 / 閉じる</span>
                    <kbd className="font-mono font-bold text-gray-700">Esc</kbd>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl shrink-0">
              <button
                onClick={() => setActiveModal('')}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-bold transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {activeModal === 'save' && (
        <div
          onClick={() => setActiveModal('')}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              execSavePlay(canOverwriteCurrent);
            }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
          >
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">プレイを保存</h3>
              <button
                type="button"
                onClick={() => setActiveModal('')}
                className="text-gray-400 hover:bg-gray-100 p-1 rounded-full"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">プレイ名</label>
                <input
                  autoFocus
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  placeholder="例: ホーンズ・フレア A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">カテゴリ</label>
                <select
                  value={saveCategoryInput}
                  onChange={(e) => setSaveCategoryInput(e.target.value as PlayCategory)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm"
                >
                  {PLAY_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 rounded-b-xl flex-wrap">
              <button
                type="button"
                onClick={() => setActiveModal('')}
                className="px-3.5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm transition"
              >
                キャンセル
              </button>
              {canOverwriteCurrent && (
                <button
                  type="button"
                  onClick={() => execSavePlay(false)}
                  className="px-3.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition"
                >
                  別名で保存
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition"
              >
                {canOverwriteCurrent ? '上書き保存' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Clear Frame Confirmation Modal */}
      {activeModal === 'clear' && (
        <div
          onClick={() => setActiveModal('')}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
          >
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">フレームを全消去</h3>
            </div>
            <div className="p-5">
              <p className="text-gray-600 text-sm">
                現在のフレームに配置されているすべての選手・ボール・ライン・メモを消去しますか？（操作後も「元に戻す」で復元できます）
              </p>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 rounded-b-xl">
              <button
                onClick={() => setActiveModal('')}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm transition"
              >
                キャンセル
              </button>
              <button
                onClick={executeClearFrame}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
              >
                消去する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
