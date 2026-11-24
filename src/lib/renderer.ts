import { CourtType, FrameData, Line, PlayObject, Point, SelectedItem } from '../types';

export const COURT_INNER_WIDTH = 1500;
export const COURT_INNER_HEIGHT_HALF = 1400;
export const COURT_INNER_HEIGHT_FULL = 2800;
export const COURT_PADDING = 100;

export const CANVAS_WIDTH = COURT_INNER_WIDTH + COURT_PADDING * 2;
export const CANVAS_HEIGHT_HALF = COURT_INNER_HEIGHT_HALF + COURT_PADDING * 2;
export const CANVAS_HEIGHT_FULL = COURT_INNER_HEIGHT_FULL + COURT_PADDING * 2;

export const TOP_HOOP_POS: Point = { x: CANVAS_WIDTH / 2, y: COURT_PADDING + 157.5 };
export const BOTTOM_HOOP_POS: Point = {
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT_FULL - COURT_PADDING - 157.5,
};

export function getCanvasHeight(courtType: CourtType): number {
  return courtType === 'full' ? CANVAS_HEIGHT_FULL : CANVAS_HEIGHT_HALF;
}

export function drawCourt(
  ctx: CanvasRenderingContext2D,
  courtType: CourtType,
  w: number,
  h: number
): void {
  ctx.fillStyle = '#eaddcf';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const startX = Math.floor((w - COURT_INNER_WIDTH) / 2);
  const innerH = courtType === 'half' ? COURT_INNER_HEIGHT_HALF : COURT_INNER_HEIGHT_FULL;
  const startY = Math.floor((h - innerH) / 2);
  const centerX = w / 2;

  if (courtType === 'half') {
    ctx.strokeRect(startX, startY, COURT_INNER_WIDTH, innerH);
    drawKeyArea(ctx, centerX, startY);
    drawCenterCircle(ctx, centerX, startY + innerH, false);
  } else {
    ctx.strokeRect(startX, startY, COURT_INNER_WIDTH, innerH);
    const midY = startY + innerH / 2;
    ctx.beginPath();
    ctx.moveTo(startX, midY);
    ctx.lineTo(startX + COURT_INNER_WIDTH, midY);
    ctx.stroke();

    drawKeyArea(ctx, centerX, startY);

    ctx.save();
    ctx.translate(centerX, startY + innerH);
    ctx.rotate(Math.PI);
    drawKeyArea(ctx, 0, 0);
    ctx.restore();

    drawCenterCircle(ctx, centerX, midY, true);
  }
}

function drawKeyArea(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number
): void {
  const keyW = 490;
  const keyH = 580;
  const boardW = 180;
  const hoopYOffset = 157.5;
  const boardYOffset = 120;
  const threeRadius = 675;
  const sideGap = 90;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.fillStyle = '#e2cba0';
  ctx.fillRect(centerX - keyW / 2, baselineY, keyW, keyH);
  ctx.strokeRect(centerX - keyW / 2, baselineY, keyW, keyH);

  const boardY = baselineY + boardYOffset;
  ctx.beginPath();
  ctx.moveTo(centerX - boardW / 2, boardY);
  ctx.lineTo(centerX + boardW / 2, boardY);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 4;
  ctx.stroke();

  const hoopY = baselineY + hoopYOffset;
  ctx.beginPath();
  ctx.arc(centerX, hoopY, 125, 0, Math.PI, false);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  const ftY = baselineY + keyH;
  ctx.beginPath();
  ctx.arc(centerX, ftY, 180, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.stroke();

  const dx = 750 - sideGap;
  const dy = Math.sqrt(threeRadius * threeRadius - dx * dx);

  ctx.beginPath();
  const leftLineX = centerX - 750 + sideGap;
  ctx.moveTo(leftLineX, baselineY);
  ctx.lineTo(leftLineX, hoopY + dy);

  const startAngle = Math.atan2(dy, -dx);
  const endAngle = Math.atan2(dy, dx);
  ctx.arc(centerX, hoopY, threeRadius, startAngle, endAngle, true);

  const rightLineX = centerX + 750 - sideGap;
  ctx.lineTo(rightLineX, baselineY);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, hoopY, 23, 0, Math.PI * 2);
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawCenterCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFull: boolean
): void {
  const r = 180;
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  if (isFull) {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    ctx.arc(x, y, r, Math.PI, 0, false);
  }
  ctx.stroke();
}

function getLabelFontSize(text: string): number {
  const len = text.length;
  if (len <= 1) return 42;
  if (len === 2) return 32;
  if (len === 3) return 24;
  return 20;
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: PlayObject,
  isSelected = false
): void {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  const scale = obj.scale || 1;
  ctx.scale(scale, scale);

  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;

  if (isSelected) {
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  if (obj.type === 'O' || obj.type === 'X') {
    const isOffense = obj.type === 'O';
    const text = obj.label !== '' && obj.label !== undefined ? String(obj.label) : isOffense ? '1' : '×';
    const fontSize = getLabelFontSize(text);

    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fillStyle = isOffense ? '#dc2626' : '#1e293b';
    ctx.fill();
    ctx.lineWidth = isSelected ? 6 : 4;
    ctx.strokeStyle = isSelected ? '#3b82f6' : '#ffffff';
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 2, 70);
  } else if (obj.type === 'Ball') {
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.clip();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(22, 0);
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 22);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected ? '#3b82f6' : '#431407';
    ctx.lineWidth = isSelected ? 5 : 2;
    ctx.stroke();
  }

  ctx.restore();
}

function getSafeArrowAngle(p0: Point, p1: Point, p2: Point): number {
  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  if (Math.hypot(dx, dy) < 1) {
    dx = p2.x - p0.x;
    dy = p2.y - p0.y;
  }
  return Math.atan2(dy, dx);
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  line: Line,
  isSelected = false
): void {
  const { p0, p1, p2, type, color } = line;
  ctx.save();
  ctx.beginPath();

  if (isSelected) {
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 16;
  }

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const angle = getSafeArrowAngle(p0, p1, p2);

  if (type === 'dribble') {
    ctx.setLineDash([]);
    const steps = 44;
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const bx = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
      const by = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
      const freq = 12 * Math.PI;
      const amp = 8;
      const envelope = Math.sin(t * Math.PI);
      const osc = Math.sin(t * freq) * amp * Math.min(1, envelope * 4);
      const tx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
      const ty = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
      const norm = Math.hypot(tx, ty) || 1;
      ctx.lineTo(bx + (-ty / norm) * osc, by + (tx / norm) * osc);
    }
    ctx.stroke();
    drawArrowHead(ctx, p2.x, p2.y, angle);
  } else if (type === 'pass') {
    ctx.setLineDash([16, 14]);
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, p2.x, p2.y, angle);
  } else if (type === 'screen') {
    ctx.setLineDash([]);
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
    const hw = 34;
    ctx.beginPath();
    ctx.moveTo(
      p2.x + (Math.cos(angle + Math.PI / 2) * hw) / 2,
      p2.y + (Math.sin(angle + Math.PI / 2) * hw) / 2
    );
    ctx.lineTo(
      p2.x + (Math.cos(angle - Math.PI / 2) * hw) / 2,
      p2.y + (Math.sin(angle - Math.PI / 2) * hw) / 2
    );
    ctx.lineWidth = 9;
    ctx.stroke();
  } else if (type === 'shoot') {
    ctx.setLineDash([6, 8]);
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, p2.x, p2.y, angle);
  } else {
    ctx.setLineDash([]);
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
    drawArrowHead(ctx, p2.x, p2.y, angle);
  }

  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number
): void {
  const size = 22;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawLineHandles(ctx: CanvasRenderingContext2D, line: Line): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(line.p0.x, line.p0.y);
  ctx.lineTo(line.p1.x, line.p1.y);
  ctx.lineTo(line.p2.x, line.p2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  drawHandle(ctx, line.p0, false);
  drawHandle(ctx, line.p1, true);
  drawHandle(ctx, line.p2, false);
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  pos: Point,
  isControl: boolean
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, isControl ? 13 : 11, 0, Math.PI * 2);
  ctx.fillStyle = isControl ? '#dbeafe' : '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawSnapIndicator(ctx: CanvasRenderingContext2D, pos: Point): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 52, 0, Math.PI * 2);
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 6;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a crisp tactical subtitle banner at the bottom of the canvas (used in video export).
 */
export function drawSubtitleBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  ctx.save();
  const fontSize = 36;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif`;
  const maxTextWidth = canvasWidth - 160;
  const lines = wrapCanvasText(ctx, trimmed, maxTextWidth, 2);
  const lineHeight = 48;
  const padY = 22;
  const padX = 40;
  const boxH = lines.length * lineHeight + padY * 2;
  const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = Math.min(canvasWidth - 80, maxLineW + padX * 2);
  const boxX = (canvasWidth - boxW) / 2;
  const boxY = canvasHeight - boxH - 28;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 16);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, idx) => {
    const y = boxY + padY + lineHeight * (idx + 0.5);
    ctx.fillText(line, canvasWidth / 2, y, maxTextWidth);
  });
  ctx.restore();
}

export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = '';

  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) {
        break;
      }
    } else {
      current = next;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
  }

  return lines.length > 0 ? lines : [''];
}

export interface RenderSceneOptions {
  courtType: CourtType;
  width: number;
  height: number;
  frame?: FrameData;
  previousFrame?: FrameData | null;
  animatingObjects?: PlayObject[] | null;
  currentDraw?: Line | null;
  selectedItem?: SelectedItem | null;
  snapTarget?: Point | null;
  subtitle?: string;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  options: RenderSceneOptions
): void {
  const {
    courtType,
    width,
    height,
    frame,
    previousFrame,
    animatingObjects,
    currentDraw,
    selectedItem,
    snapTarget,
    subtitle,
  } = options;

  ctx.clearRect(0, 0, width, height);
  drawCourt(ctx, courtType, width, height);

  if (animatingObjects) {
    if (frame) {
      for (const l of frame.lines) {
        drawLine(ctx, l, false);
      }
    }
    for (const o of animatingObjects) {
      if (o.type !== 'Ball') drawObject(ctx, o, false);
    }
    for (const o of animatingObjects) {
      if (o.type === 'Ball') drawObject(ctx, o, false);
    }
    if (subtitle) {
      drawSubtitleBanner(ctx, subtitle, width, height);
    }
    return;
  }

  if (previousFrame) {
    ctx.save();
    ctx.globalAlpha = 0.24;
    for (const l of previousFrame.lines) {
      drawLine(ctx, l, false);
    }
    for (const o of previousFrame.objects) {
      if (o.type !== 'Ball') drawObject(ctx, o, false);
    }
    for (const o of previousFrame.objects) {
      if (o.type === 'Ball') drawObject(ctx, o, false);
    }
    ctx.restore();
  }

  if (!frame) return;

  for (const l of frame.lines) {
    const isSelected = selectedItem?.type === 'line' && selectedItem.item === l;
    drawLine(ctx, l, isSelected);
    if (isSelected) {
      drawLineHandles(ctx, l);
    }
  }

  if (currentDraw) {
    drawLine(ctx, currentDraw, false);
  }

  if (snapTarget) {
    drawSnapIndicator(ctx, snapTarget);
  }

  for (const o of frame.objects) {
    if (o.type !== 'Ball') {
      const isSelected = selectedItem?.type === 'object' && selectedItem.item === o;
      drawObject(ctx, o, isSelected);
    }
  }

  for (const o of frame.objects) {
    if (o.type === 'Ball') {
      const isSelected = selectedItem?.type === 'object' && selectedItem.item === o;
      drawObject(ctx, o, isSelected);
    }
  }

  if (subtitle) {
    drawSubtitleBanner(ctx, subtitle, width, height);
  }
}
