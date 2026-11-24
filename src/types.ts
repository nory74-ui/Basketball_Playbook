export type CourtType = 'half' | 'full';
export type LineToolMode = 'move' | 'pass' | 'dribble' | 'screen' | 'shoot';
export type ToolMode = 'select' | LineToolMode;
export type ObjectType = 'O' | 'X' | 'Ball';

export type PlayCategory =
  | 'offense'
  | 'defense'
  | 'inbounds'
  | 'zone'
  | 'transition'
  | 'other';

export interface Point {
  x: number;
  y: number;
}

export interface Line {
  p0: Point;
  p1: Point;
  p2: Point;
  type: LineToolMode;
  color: string;
}

export interface PlayObject {
  id: string;
  type: ObjectType;
  label: string | number;
  x: number;
  y: number;
  scale?: number;
}

export interface FrameData {
  objects: PlayObject[];
  lines: Line[];
  note?: string;
}

export interface PlayData {
  id: string;
  name: string;
  date: string;
  courtType: CourtType;
  category?: PlayCategory;
  frames: FrameData[];
}

export type SelectedItem =
  | { type: 'object'; item: PlayObject }
  | { type: 'line'; item: Line };

export type DragItem =
  | {
      type: 'object';
      item: PlayObject;
      attachedBall?: {
        item: PlayObject;
        offsetX: number;
        offsetY: number;
      };
    }
  | { type: 'line_start'; item: Line }
  | { type: 'line_end'; item: Line }
  | { type: 'line_control'; item: Line }
  | {
      type: 'line_whole';
      item: Line;
      startPos: Point;
      originalP0: Point;
      originalP1: Point;
      originalP2: Point;
    };

export interface SelectedObjectInfo {
  id: string;
  type: ObjectType;
  label: string;
}

export interface PlaybookState {
  framesCount: number;
  currentFrameIndex: number;
  frameHasNotes: boolean[];
  currentFrameNote: string;
  mode: ToolMode;
  lineColor: string;
  playName: string;
  category: PlayCategory;
  currentPlayId: string | null;
  courtType: CourtType;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  selectedObjectInfo: SelectedObjectInfo | null;
  selectedLineColor: string | null;
  isPlaying: boolean;
  loopPlayback: boolean;
  playbackSpeed: number;
  carryOverLines: boolean;
  showOnionSkin: boolean;
  ballFollowsPlayer: boolean;
  snapToObjects: boolean;
  currentFrameLinesCount: number;
  isExporting: boolean;
  exportProgress: number;
  exportStatusText: string;
}
