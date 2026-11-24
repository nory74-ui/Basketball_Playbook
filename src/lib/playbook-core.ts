import {
  CourtType,
  DragItem,
  FrameData,
  Line,
  LineToolMode,
  ObjectType,
  PlaybookState,
  PlayCategory,
  PlayData,
  PlayObject,
  Point,
  SelectedItem,
  ToolMode,
} from '../types';
import {
  buildObjectMatchMap,
  dist,
  interpolateFrameObjects,
  isPointNearBezier,
} from './animation';
import { exportPlayToPDF, exportPlayToVideo } from './exporters';
import { FormationTemplate, instantiateFormationObjects } from './formations';
import {
  BOTTOM_HOOP_POS,
  CANVAS_WIDTH,
  getCanvasHeight,
  renderScene,
  TOP_HOOP_POS,
} from './renderer';
import { normalizeCategory } from './storage';

interface HistorySnapshot {
  frames: FrameData[];
  currentFrameIndex: number;
  courtType: CourtType;
  playName: string;
  category: PlayCategory;
}

const DEFAULT_PLAY_NAME = '新しいプレイ';
const CLAMP_MARGIN = 30;
const MAX_HISTORY = 50;

export class PlaybookCore {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrapper: HTMLElement;
  private updateState: (state: PlaybookState) => void;
  private showStatusMsg: (msg: string) => void;

  private courtType: CourtType = 'half';
  private currentCanvasHeight = getCanvasHeight('half');

  private frames: FrameData[] = [];
  private currentFrameIndex = 0;
  private mode: ToolMode = 'select';
  private color = '#1f2937';

  private dragItem: DragItem | null = null;
  private selectedItem: SelectedItem | null = null;
  private isDrawing = false;
  private currentDraw: Line | null = null;
  private snapTarget: Point | null = null;

  private playName = DEFAULT_PLAY_NAME;
  private category: PlayCategory = 'offense';
  private currentPlayId: string | null = null;

  private isPlaying = false;
  private loopPlayback = false;
  private playbackSpeed = 1;
  private carryOverLines = false;
  private showOnionSkin = false;
  private ballFollowsPlayer = true;
  private snapToObjects = true;

  private animatingObjects: PlayObject[] | null = null;
  private animationRafId: number | null = null;
  private loopWaitResolve: (() => void) | null = null;
  private loopWaitTimerId: number | null = null;

  private isExporting = false;
  private exportProgress = 0;
  private exportStatusText = '';

  private history: string[] = [];
  private historyIndex = -1;

  // On-demand rendering state
  private renderRafId: number | null = null;
  private resizeTimerId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isDestroyed = false;

  // Bound event listeners
  private handleStart: (e: PointerEvent) => void;
  private handleMove: (e: PointerEvent) => void;
  private handleEnd: () => void;
  private handleDblClick: (e: MouseEvent) => void;
  private handleResize: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    wrapper: HTMLElement,
    updateState: (state: PlaybookState) => void,
    showStatusMsg: (msg: string) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is not available');
    }
    this.ctx = context;
    this.wrapper = wrapper;
    this.updateState = updateState;
    this.showStatusMsg = showStatusMsg;

    this.handleStart = this.onStart.bind(this);
    this.handleMove = this.onMove.bind(this);
    this.handleEnd = this.onEnd.bind(this);
    this.handleDblClick = this.onDblClick.bind(this);
    this.handleResize = () => {
      if (this.isDestroyed) return;
      requestAnimationFrame(() => this.resize());
      if (this.resizeTimerId !== null) window.clearTimeout(this.resizeTimerId);
      this.resizeTimerId = window.setTimeout(() => this.resize(), 200);
    };

    this.init();
  }

  private init(): void {
    this.resize();
    window.addEventListener('resize', this.handleResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.isDestroyed) this.resize();
      });
      this.resizeObserver.observe(this.wrapper);
    }

    this.canvas.addEventListener('pointerdown', this.handleStart);
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleEnd);
    window.addEventListener('pointercancel', this.handleEnd);
    this.canvas.addEventListener('dblclick', this.handleDblClick);

    this.frames = [{ objects: [], lines: [], note: '' }];
    this.currentFrameIndex = 0;
    this.addDefaultObjects();
    this.saveState();
    this.notifyState();
    this.requestRender();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isPlaying = false;
    this.cancelLoopWait();

    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.handleStart);
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleEnd);
    window.removeEventListener('pointercancel', this.handleEnd);
    this.canvas.removeEventListener('dblclick', this.handleDblClick);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeTimerId !== null) {
      window.clearTimeout(this.resizeTimerId);
      this.resizeTimerId = null;
    }
    if (this.renderRafId !== null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    if (this.animationRafId !== null) {
      cancelAnimationFrame(this.animationRafId);
      this.animationRafId = null;
    }
  }

  // --- Rendering (On-Demand) ---
  public requestRender(): void {
    if (this.isDestroyed || this.renderRafId !== null) return;
    this.renderRafId = requestAnimationFrame(() => {
      this.renderRafId = null;
      this.renderNow();
    });
  }

  private renderNow(): void {
    if (this.isDestroyed) return;
    const previousFrame =
      this.showOnionSkin && !this.isPlaying && this.currentFrameIndex > 0
        ? this.frames[this.currentFrameIndex - 1]
        : null;

    renderScene(this.ctx, {
      courtType: this.courtType,
      width: CANVAS_WIDTH,
      height: this.currentCanvasHeight,
      frame: this.getCurrentFrame(),
      previousFrame,
      animatingObjects: this.animatingObjects,
      currentDraw: this.currentDraw,
      selectedItem: this.selectedItem,
      snapTarget: this.snapTarget,
    });
  }

  private notifyState(): void {
    if (this.isDestroyed) return;
    const currentFrame = this.getCurrentFrame();
    const selectedObjectInfo =
      this.selectedItem?.type === 'object'
        ? {
            id: this.selectedItem.item.id,
            type: this.selectedItem.item.type,
            label: String(this.selectedItem.item.label ?? ''),
          }
        : null;

    const selectedLineColor =
      this.selectedItem?.type === 'line' ? this.selectedItem.item.color : null;

    this.updateState({
      framesCount: this.frames.length,
      currentFrameIndex: this.currentFrameIndex,
      frameHasNotes: this.frames.map((f) => Boolean(f.note && f.note.trim().length > 0)),
      currentFrameNote: currentFrame?.note ?? '',
      mode: this.mode,
      lineColor: this.color,
      playName: this.playName,
      category: this.category,
      currentPlayId: this.currentPlayId,
      courtType: this.courtType,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
      hasSelection: this.selectedItem !== null,
      selectedObjectInfo,
      selectedLineColor,
      isPlaying: this.isPlaying,
      loopPlayback: this.loopPlayback,
      playbackSpeed: this.playbackSpeed,
      carryOverLines: this.carryOverLines,
      showOnionSkin: this.showOnionSkin,
      ballFollowsPlayer: this.ballFollowsPlayer,
      snapToObjects: this.snapToObjects,
      currentFrameLinesCount: currentFrame ? currentFrame.lines.length : 0,
      isExporting: this.isExporting,
      exportProgress: this.exportProgress,
      exportStatusText: this.exportStatusText,
    });
  }

  // --- History (Undo / Redo) ---
  private serializeSnapshot(): string {
    const snap: HistorySnapshot = {
      frames: this.frames,
      currentFrameIndex: this.currentFrameIndex,
      courtType: this.courtType,
      playName: this.playName,
      category: this.category,
    };
    return JSON.stringify(snap);
  }

  private applySnapshot(snapshotStr: string): void {
    const state = JSON.parse(snapshotStr) as HistorySnapshot;
    this.frames = state.frames;
    this.currentFrameIndex = Math.min(state.currentFrameIndex, Math.max(0, this.frames.length - 1));
    this.playName = state.playName;
    this.category = normalizeCategory(state.category);
    if (this.courtType !== state.courtType) {
      this.courtType = state.courtType;
      this.currentCanvasHeight = getCanvasHeight(state.courtType);
      this.resize();
    }
    this.selectedItem = null;
    this.dragItem = null;
    this.isDrawing = false;
    this.currentDraw = null;
    this.snapTarget = null;
    this.notifyState();
    this.requestRender();
  }

  private saveState(): void {
    if (this.isPlaying) return;
    const serialized = this.serializeSnapshot();

    if (this.historyIndex >= 0 && this.history[this.historyIndex] === serialized) {
      return;
    }

    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(serialized);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
    this.notifyState();
  }

  public undo(): void {
    if (this.isPlaying || this.isExporting || this.historyIndex <= 0) return;
    this.historyIndex--;
    this.applySnapshot(this.history[this.historyIndex]);
    this.showStatusMsg('元に戻しました');
  }

  public redo(): void {
    if (this.isPlaying || this.isExporting || this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.applySnapshot(this.history[this.historyIndex]);
    this.showStatusMsg('やり直しました');
  }

  // --- Play Settings & Properties ---
  public setPlayName(name: string): void {
    this.playName = name;
    this.notifyState();
  }

  public commitPlayName(): void {
    const trimmed = this.playName.trim() || DEFAULT_PLAY_NAME;
    this.playName = trimmed;
    this.saveState();
    this.notifyState();
  }

  public setCategory(category: PlayCategory): void {
    this.category = normalizeCategory(category);
    this.saveState();
    this.notifyState();
  }

  public setCurrentFrameNote(note: string): void {
    const frame = this.getCurrentFrame();
    if (!frame) return;
    frame.note = note;
    this.notifyState();
  }

  public commitCurrentFrameNote(): void {
    this.saveState();
    this.notifyState();
  }

  public setSelectedObjectLabel(label: string, commit = false): void {
    if (this.isPlaying || this.isExporting) return;
    if (!this.selectedItem || this.selectedItem.type !== 'object') return;
    if (this.selectedItem.item.type === 'Ball') return;

    const normalized = label.slice(0, 4);
    const targetId = this.selectedItem.item.id;

    // Keep label consistent across all frames for the same player id
    for (const frame of this.frames) {
      for (const obj of frame.objects) {
        if (obj.id === targetId && obj.type === this.selectedItem.item.type) {
          obj.label = normalized;
        }
      }
    }

    if (commit) {
      this.saveState();
    }
    this.notifyState();
    this.requestRender();
  }

  public commitSelectedObjectLabel(): void {
    this.saveState();
    this.notifyState();
  }

  public setLineColor(color: string): void {
    this.color = color;
    if (this.selectedItem?.type === 'line') {
      this.selectedItem.item.color = color;
      this.saveState();
      this.requestRender();
    }
    this.notifyState();
  }

  public setCourtType(type: CourtType, save = true): void {
    if (this.isPlaying || this.isExporting) return;
    if (type === this.courtType && save) return;
    this.courtType = type;
    this.currentCanvasHeight = getCanvasHeight(type);
    this.resize();
    if (save) {
      this.showStatusMsg(type === 'full' ? 'フルコートに変更しました' : 'ハーフコートに変更しました');
      this.saveState();
    }
    this.notifyState();
    this.requestRender();
  }

  public setCarryOverLines(value: boolean): void {
    this.carryOverLines = value;
    this.notifyState();
  }

  public setShowOnionSkin(value: boolean): void {
    this.showOnionSkin = value;
    this.notifyState();
    this.requestRender();
  }

  public setLoopPlayback(value: boolean): void {
    this.loopPlayback = value;
    this.notifyState();
    this.showStatusMsg(value ? 'ループ再生: オン' : 'ループ再生: オフ');
  }

  public setBallFollowsPlayer(value: boolean): void {
    this.ballFollowsPlayer = value;
    this.notifyState();
  }

  public setSnapToObjects(value: boolean): void {
    this.snapToObjects = value;
    this.notifyState();
  }

  public cyclePlaybackSpeed(): void {
    const speeds = [0.5, 1, 1.5];
    const nextIdx = (speeds.indexOf(this.playbackSpeed) + 1) % speeds.length;
    this.playbackSpeed = speeds[nextIdx];
    this.notifyState();
    this.showStatusMsg(`再生速度: ${this.playbackSpeed}x`);
  }

  // --- Formations ---
  public applyFormation(template: FormationTemplate, mode: 'replace' | 'append' = 'replace'): void {
    if (this.isPlaying || this.isExporting) return;
    const frame = this.getCurrentFrame();
    if (!frame) return;

    if (
      (mode === 'replace' && template.courtType !== this.courtType) ||
      (template.courtType === 'full' && this.courtType !== 'full')
    ) {
      this.courtType = template.courtType;
      this.currentCanvasHeight = getCanvasHeight(template.courtType);
      this.resize();
    }

    const newObjects = instantiateFormationObjects(template);
    if (mode === 'replace') {
      frame.objects = newObjects;
      frame.lines = [];
    } else {
      frame.objects.push(...newObjects);
    }

    this.selectedItem = null;
    this.setTool('select', false);
    this.saveState();
    this.requestRender();
    this.showStatusMsg(
      mode === 'replace'
        ? `「${template.name}」を配置しました`
        : `「${template.name}」を追加しました`
    );
  }

  // --- Frame Management ---
  private createNextFrameData(): FrameData {
    if (this.frames.length === 0) {
      return { objects: [], lines: [], note: '' };
    }
    const source = this.frames[this.currentFrameIndex] ?? this.frames[this.frames.length - 1];
    return {
      objects: JSON.parse(JSON.stringify(source.objects)),
      lines: this.carryOverLines ? JSON.parse(JSON.stringify(source.lines)) : [],
      note: '',
    };
  }

  public addFrame(): void {
    if (this.isPlaying || this.isExporting) return;
    const newFrame = this.createNextFrameData();
    const insertIndex = this.currentFrameIndex + 1;
    this.frames.splice(insertIndex, 0, newFrame);
    this.currentFrameIndex = insertIndex;
    this.selectedItem = null;
    this.showStatusMsg(`フレーム ${insertIndex + 1} を追加しました`);
    this.saveState();
    this.requestRender();
  }

  public advanceFrameAlongLines(): void {
    if (this.isPlaying || this.isExporting) return;
    const source = this.getCurrentFrame();
    if (!source) return;

    const nextObjects: PlayObject[] = JSON.parse(JSON.stringify(source.objects));
    const claimedPlayers = new Set<string>();
    const claimedBalls = new Set<string>();

    let movedPlayersCount = 0;
    let movedBallsCount = 0;

    // Phase 1: Player movement lines (dribble, move, screen)
    const playerLines = source.lines.filter(
      (l) => l.type === 'dribble' || l.type === 'move' || l.type === 'screen'
    );

    for (const line of playerLines) {
      let bestPlayer: PlayObject | null = null;
      let bestOrigin: PlayObject | null = null;
      let minDist = 135;

      for (let i = 0; i < source.objects.length; i++) {
        const orig = source.objects[i];
        if (orig.type !== 'O' && orig.type !== 'X') continue;
        if (claimedPlayers.has(orig.id)) continue;

        const d = dist(orig, line.p0);
        if (d < minDist) {
          minDist = d;
          bestOrigin = orig;
          bestPlayer = nextObjects[i];
        }
      }

      if (bestPlayer && bestOrigin) {
        const dest = this.clampPoint(line.p2);
        bestPlayer.x = dest.x;
        bestPlayer.y = dest.y;
        claimedPlayers.add(bestOrigin.id);
        movedPlayersCount++;

        if (line.type === 'dribble') {
          let bestBall: PlayObject | null = null;
          let bestBallOrig: PlayObject | null = null;
          let minBallDist = 135;

          for (let i = 0; i < source.objects.length; i++) {
            const origBall = source.objects[i];
            if (origBall.type !== 'Ball' || claimedBalls.has(origBall.id)) continue;
            const dToLine = dist(origBall, line.p0);
            const dToPlayer = dist(origBall, bestOrigin);
            const effectiveDist = Math.min(dToLine, dToPlayer);
            if (effectiveDist < minBallDist) {
              minBallDist = effectiveDist;
              bestBallOrig = origBall;
              bestBall = nextObjects[i];
            }
          }

          if (bestBall && bestBallOrig) {
            let offsetX = bestBallOrig.x - bestOrigin.x;
            let offsetY = bestBallOrig.y - bestOrigin.y;
            const offsetLen = Math.hypot(offsetX, offsetY);
            if (offsetLen < 20) {
              offsetX = 50;
              offsetY = 18;
            } else if (offsetLen > 65) {
              offsetX = (offsetX / offsetLen) * 55;
              offsetY = (offsetY / offsetLen) * 55;
            }
            const ballDest = this.clampPoint({ x: dest.x + offsetX, y: dest.y + offsetY });
            bestBall.x = ballDest.x;
            bestBall.y = ballDest.y;
            claimedBalls.add(bestBallOrig.id);
            movedBallsCount++;
          }
        }
      }
    }

    // Phase 2: Ball movement lines (pass, shoot)
    const ballLines = source.lines.filter((l) => l.type === 'pass' || l.type === 'shoot');

    for (const line of ballLines) {
      let bestBall: PlayObject | null = null;
      let bestBallOrig: PlayObject | null = null;
      let minBallDist = 140;

      for (let i = 0; i < source.objects.length; i++) {
        const origBall = source.objects[i];
        if (origBall.type !== 'Ball' || claimedBalls.has(origBall.id)) continue;
        const d = dist(origBall, line.p0);
        if (d < minBallDist) {
          minBallDist = d;
          bestBallOrig = origBall;
          bestBall = nextObjects[i];
        }
      }

      if (!bestBall) {
        const passer = source.objects.find(
          (o) => (o.type === 'O' || o.type === 'X') && dist(o, line.p0) < 120
        );
        if (passer) {
          for (let i = 0; i < source.objects.length; i++) {
            const origBall = source.objects[i];
            if (origBall.type !== 'Ball' || claimedBalls.has(origBall.id)) continue;
            if (dist(origBall, passer) < 110) {
              bestBallOrig = origBall;
              bestBall = nextObjects[i];
              break;
            }
          }
        }
      }

      if (bestBall && bestBallOrig) {
        let dest = this.clampPoint(line.p2);

        if (line.type === 'pass') {
          let receiver: PlayObject | null = null;
          let minRecvDist = 110;
          for (const candidate of nextObjects) {
            if (candidate.type !== 'O' && candidate.type !== 'X') continue;
            const d = dist(candidate, line.p2);
            if (d < minRecvDist) {
              minRecvDist = d;
              receiver = candidate;
            }
          }
          if (receiver) {
            const sideSign = receiver.x > CANVAS_WIDTH / 2 ? -1 : 1;
            dest = this.clampPoint({
              x: receiver.x + sideSign * 50,
              y: receiver.y + 16,
            });
          }
        }

        bestBall.x = dest.x;
        bestBall.y = dest.y;
        claimedBalls.add(bestBallOrig.id);
        movedBallsCount++;
      }
    }

    const newFrame: FrameData = {
      objects: nextObjects,
      lines: [],
      note: '',
    };

    const insertIndex = this.currentFrameIndex + 1;
    this.frames.splice(insertIndex, 0, newFrame);
    this.currentFrameIndex = insertIndex;
    this.selectedItem = null;
    this.setTool('select', false);
    this.saveState();
    this.requestRender();

    if (movedPlayersCount === 0 && movedBallsCount === 0) {
      this.showStatusMsg(`フレーム ${insertIndex + 1} を作成しました（対象の矢印なし）`);
    } else {
      const parts: string[] = [];
      if (movedPlayersCount > 0) parts.push(`選手${movedPlayersCount}人`);
      if (movedBallsCount > 0) parts.push('ボール');
      this.showStatusMsg(`フレーム ${insertIndex + 1} へ自動展開（${parts.join('・')}を移動）`);
    }
  }

  public deleteFrame(index: number): void {
    if (this.isPlaying || this.isExporting || this.frames.length <= 1) return;
    if (index < 0 || index >= this.frames.length) return;
    this.frames.splice(index, 1);
    if (this.currentFrameIndex >= this.frames.length) {
      this.currentFrameIndex = this.frames.length - 1;
    }
    this.selectedItem = null;
    this.showStatusMsg(`フレーム ${index + 1} を削除しました`);
    this.saveState();
    this.requestRender();
  }

  public switchFrame(index: number): void {
    if (this.isPlaying || this.isExporting) return;
    if (index < 0 || index >= this.frames.length) return;
    this.currentFrameIndex = index;
    this.setTool('select');
    this.selectedItem = null;
    this.notifyState();
    this.requestRender();
  }

  public stepFrame(delta: -1 | 1): void {
    if (this.isPlaying || this.isExporting) return;
    const target = this.currentFrameIndex + delta;
    if (target < 0 || target >= this.frames.length) return;
    this.switchFrame(target);
  }

  public getCurrentFrame(): FrameData {
    return this.frames[this.currentFrameIndex];
  }

  private addDefaultObjects(): void {
    const f = this.getCurrentFrame();
    if (f && f.objects.length === 0) {
      this.addObject('O', 1, CANVAS_WIDTH / 2, this.currentCanvasHeight * 0.7, false);
      this.addObject('Ball', '', CANVAS_WIDTH / 2 + 65, this.currentCanvasHeight * 0.7 + 20, false);
    }
  }

  public clearFrame(): void {
    if (this.isPlaying || this.isExporting) return;
    const f = this.getCurrentFrame();
    if (!f) return;
    f.objects = [];
    f.lines = [];
    f.note = '';
    this.selectedItem = null;
    this.saveState();
    this.requestRender();
    this.showStatusMsg('フレームをクリアしました（元に戻せます）');
  }

  public clearSelection(): void {
    if (!this.selectedItem) return;
    this.selectedItem = null;
    this.notifyState();
    this.requestRender();
  }

  // --- Save / Load ---
  public loadPlayData(play: PlayData): void {
    if (this.isPlaying || this.isExporting) return;
    const clonedFrames: FrameData[] = JSON.parse(JSON.stringify(play.frames));
    if (!Array.isArray(clonedFrames) || clonedFrames.length === 0) return;

    for (const f of clonedFrames) {
      f.objects = (f.objects || []).map((o) => ({ ...o, id: String(o.id) }));
      f.lines = f.lines || [];
      f.note = typeof f.note === 'string' ? f.note : '';
    }

    this.frames = clonedFrames;
    this.courtType = play.courtType || 'half';
    this.currentCanvasHeight = getCanvasHeight(this.courtType);
    this.resize();
    this.currentFrameIndex = 0;
    this.playName = play.name || DEFAULT_PLAY_NAME;
    this.category = normalizeCategory(play.category);
    this.currentPlayId = play.id;
    this.selectedItem = null;
    this.history = [];
    this.historyIndex = -1;
    this.saveState();
    this.requestRender();
    this.showStatusMsg(`「${this.playName}」を読み込みました`);
  }

  public getPlayDataToSave(nameOverride?: string, categoryOverride?: PlayCategory): PlayData {
    const finalName = (nameOverride ?? this.playName).trim() || DEFAULT_PLAY_NAME;
    const finalCategory = normalizeCategory(categoryOverride ?? this.category);
    this.playName = finalName;
    this.category = finalCategory;
    return {
      id: this.currentPlayId || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: finalName,
      date: new Date().toLocaleString('ja-JP'),
      courtType: this.courtType,
      category: finalCategory,
      frames: JSON.parse(JSON.stringify(this.frames)),
    };
  }

  public markSavedPlayId(id: string, name: string, category: PlayCategory): void {
    this.currentPlayId = id;
    this.playName = name;
    this.category = normalizeCategory(category);
    this.saveState();
    this.notifyState();
  }

  // --- Coordinates, Snapping & Interaction ---
  private clampPoint(pt: Point): Point {
    return {
      x: Math.max(CLAMP_MARGIN, Math.min(CANVAS_WIDTH - CLAMP_MARGIN, pt.x)),
      y: Math.max(CLAMP_MARGIN, Math.min(this.currentCanvasHeight - CLAMP_MARGIN, pt.y)),
    };
  }

  private findSnapPoint(pos: Point, lineType?: LineToolMode): Point | null {
    if (!this.snapToObjects) return null;
    const frame = this.getCurrentFrame();
    if (!frame) return null;

    let best: Point | null = null;
    let minDst = 72;

    for (const obj of frame.objects) {
      const d = dist(pos, obj);
      if (d < minDst) {
        minDst = d;
        best = { x: obj.x, y: obj.y };
      }
    }

    // For shoot lines, magnetically snap endpoint to the rim
    if (lineType === 'shoot') {
      const hoops = this.courtType === 'full' ? [TOP_HOOP_POS, BOTTOM_HOOP_POS] : [TOP_HOOP_POS];
      for (const hoop of hoops) {
        const d = dist(pos, hoop);
        if (d < 90 && d < minDst + 18) {
          minDst = d;
          best = { x: hoop.x, y: hoop.y };
        }
      }
    }

    return best;
  }

  private getPos(e: PointerEvent | MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private onStart(e: PointerEvent): void {
    if (this.isPlaying || this.isExporting) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.cancelable) e.preventDefault();

    const pos = this.clampPoint(this.getPos(e));
    const frame = this.getCurrentFrame();
    if (!frame) return;

    let hitSomething = false;

    if (this.mode === 'select') {
      const handleRadius = 30;

      const linesToCheck =
        this.selectedItem?.type === 'line'
          ? [this.selectedItem.item, ...frame.lines.filter((l) => l !== this.selectedItem?.item)]
          : frame.lines;

      for (const line of linesToCheck) {
        if (dist(pos, line.p0) < handleRadius) {
          this.dragItem = { type: 'line_start', item: line };
          this.selectedItem = { type: 'line', item: line };
          hitSomething = true;
          break;
        }
        if (dist(pos, line.p2) < handleRadius) {
          this.dragItem = { type: 'line_end', item: line };
          this.selectedItem = { type: 'line', item: line };
          hitSomething = true;
          break;
        }
        if (dist(pos, line.p1) < handleRadius) {
          this.dragItem = { type: 'line_control', item: line };
          this.selectedItem = { type: 'line', item: line };
          hitSomething = true;
          break;
        }
      }

      if (!hitSomething) {
        for (let i = frame.objects.length - 1; i >= 0; i--) {
          const obj = frame.objects[i];
          const hitRadius = obj.type === 'Ball' ? 36 : 50;
          if (dist(pos, obj) < hitRadius) {
            let attachedBall:
              | { item: PlayObject; offsetX: number; offsetY: number }
              | undefined;

            // Attach nearby ball when dragging a player if ballFollowsPlayer is enabled
            if (this.ballFollowsPlayer && (obj.type === 'O' || obj.type === 'X')) {
              let nearestBall: PlayObject | null = null;
              let minBallDist = 95;
              for (const candidate of frame.objects) {
                if (candidate.type !== 'Ball') continue;
                const d = dist(obj, candidate);
                if (d < minBallDist) {
                  minBallDist = d;
                  nearestBall = candidate;
                }
              }
              if (nearestBall) {
                attachedBall = {
                  item: nearestBall,
                  offsetX: nearestBall.x - obj.x,
                  offsetY: nearestBall.y - obj.y,
                };
              }
            }

            this.dragItem = { type: 'object', item: obj, attachedBall };
            this.selectedItem = { type: 'object', item: obj };
            hitSomething = true;
            break;
          }
        }
      }

      if (!hitSomething) {
        for (let i = frame.lines.length - 1; i >= 0; i--) {
          const line = frame.lines[i];
          if (isPointNearBezier(pos, line.p0, line.p1, line.p2, 24)) {
            this.dragItem = {
              type: 'line_whole',
              item: line,
              startPos: pos,
              originalP0: { ...line.p0 },
              originalP1: { ...line.p1 },
              originalP2: { ...line.p2 },
            };
            this.selectedItem = { type: 'line', item: line };
            hitSomething = true;
            break;
          }
        }
      }

      if (!hitSomething) {
        this.selectedItem = null;
      }
    } else {
      const snappedStart = this.findSnapPoint(pos, this.mode);
      const startPt = snappedStart ?? pos;
      this.snapTarget = snappedStart;
      this.isDrawing = true;
      this.currentDraw = {
        type: this.mode,
        p0: { ...startPt },
        p1: { ...startPt },
        p2: { ...startPt },
        color: this.color,
      };
    }

    this.notifyState();
    this.requestRender();
  }

  private onMove(e: PointerEvent): void {
    if (this.isPlaying || this.isExporting) return;
    if (!this.dragItem && !this.isDrawing) return;

    if (e.pointerType === 'touch' && e.cancelable) {
      e.preventDefault();
    }

    const pos = this.clampPoint(this.getPos(e));

    if (this.dragItem) {
      switch (this.dragItem.type) {
        case 'object': {
          this.dragItem.item.x = pos.x;
          this.dragItem.item.y = pos.y;
          if (this.dragItem.attachedBall) {
            const { item: ball, offsetX, offsetY } = this.dragItem.attachedBall;
            const ballPos = this.clampPoint({ x: pos.x + offsetX, y: pos.y + offsetY });
            ball.x = ballPos.x;
            ball.y = ballPos.y;
          }
          this.snapTarget = null;
          break;
        }
        case 'line_start': {
          const snapped = this.findSnapPoint(pos, this.dragItem.item.type);
          this.snapTarget = snapped;
          this.dragItem.item.p0 = snapped ?? pos;
          break;
        }
        case 'line_end': {
          const snapped = this.findSnapPoint(pos, this.dragItem.item.type);
          this.snapTarget = snapped;
          this.dragItem.item.p2 = snapped ?? pos;
          break;
        }
        case 'line_control':
          this.snapTarget = null;
          this.dragItem.item.p1 = pos;
          break;
        case 'line_whole': {
          this.snapTarget = null;
          const rawDx = pos.x - this.dragItem.startPos.x;
          const rawDy = pos.y - this.dragItem.startPos.y;
          const { originalP0, originalP1, originalP2 } = this.dragItem;
          const minX = Math.min(originalP0.x, originalP1.x, originalP2.x);
          const maxX = Math.max(originalP0.x, originalP1.x, originalP2.x);
          const minY = Math.min(originalP0.y, originalP1.y, originalP2.y);
          const maxY = Math.max(originalP0.y, originalP1.y, originalP2.y);

          const dx = Math.max(CLAMP_MARGIN - minX, Math.min(CANVAS_WIDTH - CLAMP_MARGIN - maxX, rawDx));
          const dy = Math.max(
            CLAMP_MARGIN - minY,
            Math.min(this.currentCanvasHeight - CLAMP_MARGIN - maxY, rawDy)
          );

          this.dragItem.item.p0 = { x: originalP0.x + dx, y: originalP0.y + dy };
          this.dragItem.item.p1 = { x: originalP1.x + dx, y: originalP1.y + dy };
          this.dragItem.item.p2 = { x: originalP2.x + dx, y: originalP2.y + dy };
          break;
        }
      }
      this.requestRender();
    } else if (this.isDrawing && this.currentDraw) {
      const snappedEnd = this.findSnapPoint(pos, this.currentDraw.type);
      const endPt = snappedEnd ?? pos;
      this.snapTarget = snappedEnd;
      this.currentDraw.p2 = endPt;
      this.currentDraw.p1 = {
        x: (this.currentDraw.p0.x + endPt.x) / 2,
        y: (this.currentDraw.p0.y + endPt.y) / 2,
      };
      this.requestRender();
    }
  }

  private onEnd(): void {
    if (this.isPlaying || this.isExporting) return;

    this.snapTarget = null;

    if (this.dragItem) {
      this.dragItem = null;
      this.saveState();
      this.requestRender();
    } else if (this.isDrawing && this.currentDraw) {
      this.isDrawing = false;
      const drawn = this.currentDraw;
      this.currentDraw = null;

      if (dist(drawn.p0, drawn.p2) > 20) {
        this.getCurrentFrame().lines.push(drawn);
        this.selectedItem = { type: 'line', item: drawn };
        this.setTool('select', false);
        this.saveState();
      }
      this.notifyState();
      this.requestRender();
    }
  }

  private onDblClick(e: MouseEvent): void {
    if (this.isPlaying || this.isExporting) return;
    const pos = this.getPos(e);
    const frame = this.getCurrentFrame();
    if (!frame) return;

    for (let i = frame.objects.length - 1; i >= 0; i--) {
      if (dist(pos, frame.objects[i]) < 50) {
        frame.objects.splice(i, 1);
        this.selectedItem = null;
        this.saveState();
        this.requestRender();
        this.showStatusMsg('オブジェクトを削除しました');
        return;
      }
    }

    for (let i = frame.lines.length - 1; i >= 0; i--) {
      const l = frame.lines[i];
      if (
        dist(pos, l.p1) < 40 ||
        dist(pos, l.p0) < 40 ||
        dist(pos, l.p2) < 40 ||
        isPointNearBezier(pos, l.p0, l.p1, l.p2, 24)
      ) {
        frame.lines.splice(i, 1);
        this.selectedItem = null;
        this.saveState();
        this.requestRender();
        this.showStatusMsg('ラインを削除しました');
        return;
      }
    }
  }

  // --- Object & Tool Actions ---
  public addObject(
    type: ObjectType,
    label: string | number = '',
    x?: number,
    y?: number,
    save = true
  ): void {
    if (this.isPlaying || this.isExporting) return;
    const frame = this.getCurrentFrame();
    if (!frame) return;

    if (type === 'O' && label === '') {
      let max = 0;
      frame.objects.forEach((o) => {
        if (o.type === 'O') max = Math.max(max, parseInt(String(o.label), 10) || 0);
      });
      label = (max % 5) + 1;
    } else if (type === 'X' && label === '') {
      label = '×';
    }

    let targetX = x !== undefined ? x : CANVAS_WIDTH / 2;
    let targetY = y !== undefined ? y : this.currentCanvasHeight / 2;

    if (x === undefined && y === undefined) {
      let attempts = 0;
      while (
        attempts < 8 &&
        frame.objects.some((o) => dist(o, { x: targetX, y: targetY }) < 35)
      ) {
        targetX += 55;
        targetY += 35;
        attempts++;
      }
    }

    const clamped = this.clampPoint({ x: targetX, y: targetY });
    const newObj: PlayObject = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      label,
      x: clamped.x,
      y: clamped.y,
    };

    frame.objects.push(newObj);
    this.selectedItem = { type: 'object', item: newObj };
    this.setTool('select', false);
    if (save) this.saveState();
    this.notifyState();
    this.requestRender();
  }

  public addPlayer(type: 'O' | 'X'): void {
    this.addObject(type);
  }

  public addBall(): void {
    this.addObject('Ball');
  }

  public setTool(t: ToolMode, clearSelected = true): void {
    this.mode = t;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    if (t !== 'select' && clearSelected) {
      this.selectedItem = null;
    }
    this.notifyState();
    this.requestRender();
  }

  public deleteSelection(): void {
    if (this.isPlaying || this.isExporting || !this.selectedItem) return;
    const frame = this.getCurrentFrame();
    if (!frame) return;

    if (this.selectedItem.type === 'object') {
      const idx = frame.objects.indexOf(this.selectedItem.item);
      if (idx > -1) frame.objects.splice(idx, 1);
    } else {
      const idx = frame.lines.indexOf(this.selectedItem.item);
      if (idx > -1) frame.lines.splice(idx, 1);
    }

    this.selectedItem = null;
    this.showStatusMsg('削除しました');
    this.saveState();
    this.requestRender();
  }

  // --- Resize ---
  public resize(): void {
    if (!this.wrapper || this.isDestroyed) return;
    const wrapperRect = this.wrapper.getBoundingClientRect();
    const availableW = Math.max(120, wrapperRect.width - 20);
    const availableH = Math.max(120, wrapperRect.height - 20);

    const aspect = CANVAS_WIDTH / this.currentCanvasHeight;

    let w = availableW;
    let h = w / aspect;

    if (h > availableH) {
      h = availableH;
      w = h * aspect;
    }

    w = Math.floor(w);
    h = Math.floor(h);

    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    if (this.canvas.width !== CANVAS_WIDTH || this.canvas.height !== this.currentCanvasHeight) {
      this.canvas.width = CANVAS_WIDTH;
      this.canvas.height = this.currentCanvasHeight;
    }
    this.requestRender();
  }

  // --- Playback (with Loop support) ---
  private cancelLoopWait(): void {
    if (this.loopWaitTimerId !== null) {
      window.clearTimeout(this.loopWaitTimerId);
      this.loopWaitTimerId = null;
    }
    if (this.loopWaitResolve) {
      const resolve = this.loopWaitResolve;
      this.loopWaitResolve = null;
      resolve();
    }
  }

  private waitInterruptible(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.loopWaitResolve = resolve;
      this.loopWaitTimerId = window.setTimeout(() => {
        this.loopWaitTimerId = null;
        this.loopWaitResolve = null;
        resolve();
      }, ms);
    });
  }

  public togglePlayback(): void {
    if (this.isExporting) return;
    if (this.isPlaying) {
      this.stopAnimation();
    } else {
      void this.playAnimation();
    }
  }

  public stopAnimation(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.cancelLoopWait();
    if (this.animationRafId !== null) {
      cancelAnimationFrame(this.animationRafId);
      this.animationRafId = null;
    }
    this.animatingObjects = null;
    this.notifyState();
    this.requestRender();
    this.showStatusMsg('再生を停止しました');
  }

  public async playAnimation(): Promise<void> {
    if (this.isPlaying || this.isExporting) return;
    if (this.frames.length < 2) {
      this.showStatusMsg('再生するには2フレーム以上必要です');
      return;
    }

    this.isPlaying = true;
    this.selectedItem = null;
    this.showStatusMsg(this.loopPlayback ? 'ループ再生中...' : '再生中...');
    this.notifyState();

    do {
      for (let i = 0; i < this.frames.length - 1; i++) {
        if (!this.isPlaying || this.isDestroyed) break;
        this.currentFrameIndex = i;
        this.notifyState();

        const duration = 1000 / Math.max(0.25, this.playbackSpeed);
        await this.animateTransition(this.frames[i], this.frames[i + 1], duration);
        if (!this.isPlaying || this.isDestroyed) break;
      }

      if (!this.isPlaying || this.isDestroyed) break;

      this.currentFrameIndex = this.frames.length - 1;
      this.animatingObjects = null;
      this.notifyState();
      this.renderNow();

      if (this.loopPlayback) {
        await this.waitInterruptible(650);
      }
    } while (this.loopPlayback && this.isPlaying && !this.isDestroyed);

    this.isPlaying = false;
    this.animatingObjects = null;
    this.animationRafId = null;
    this.notifyState();
    this.requestRender();
  }

  private animateTransition(
    startFrame: FrameData,
    endFrame: FrameData,
    duration: number
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const matchMap = buildObjectMatchMap(startFrame, endFrame);

      const step = (currentTime: number) => {
        if (!this.isPlaying || this.isDestroyed) {
          this.animatingObjects = null;
          this.animationRafId = null;
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        this.animatingObjects = interpolateFrameObjects(startFrame, endFrame, matchMap, progress);
        this.renderNow();

        if (progress < 1) {
          this.animationRafId = requestAnimationFrame(step);
        } else {
          this.animatingObjects = null;
          this.animationRafId = null;
          resolve();
        }
      };

      this.animationRafId = requestAnimationFrame(step);
    });
  }

  // --- Exports ---
  public async exportPDF(): Promise<void> {
    if (this.isPlaying || this.isExporting) return;

    this.isExporting = true;
    this.exportProgress = 0;
    this.exportStatusText = 'PDFを作成中...';
    this.selectedItem = null;
    this.notifyState();

    try {
      await exportPlayToPDF(this.frames, this.courtType, this.playName, (progress, text) => {
        this.exportProgress = progress;
        this.exportStatusText = text;
        this.notifyState();
      });
      this.showStatusMsg('PDFをダウンロードしました');
    } catch (e) {
      console.error('PDF Export failed:', e);
      this.showStatusMsg(e instanceof Error ? e.message : 'PDF出力に失敗しました');
    } finally {
      this.isExporting = false;
      this.exportProgress = 0;
      this.exportStatusText = '';
      this.notifyState();
      this.requestRender();
    }
  }

  public async exportVideo(): Promise<void> {
    if (this.isPlaying || this.isExporting) return;
    if (this.frames.length < 2) {
      this.showStatusMsg('動画を出力するには2フレーム以上必要です');
      return;
    }

    this.isExporting = true;
    this.exportProgress = 0;
    this.exportStatusText = '動画を作成中...';
    this.selectedItem = null;
    this.notifyState();

    try {
      const ext = await exportPlayToVideo(
        this.frames,
        this.courtType,
        this.playName,
        this.playbackSpeed,
        (progress, text) => {
          this.exportProgress = progress;
          this.exportStatusText = text;
          this.notifyState();
        }
      );
      this.showStatusMsg(`${ext.toUpperCase()}動画をダウンロードしました`);
    } catch (e) {
      console.error('Video Export failed:', e);
      this.showStatusMsg(e instanceof Error ? e.message : '動画出力に失敗しました');
    } finally {
      this.isExporting = false;
      this.exportProgress = 0;
      this.exportStatusText = '';
      this.notifyState();
      this.requestRender();
    }
  }
}
