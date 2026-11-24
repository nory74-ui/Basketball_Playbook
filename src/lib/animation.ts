import { FrameData, Line, PlayObject, Point } from '../types';

export function dist(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getBezierPoint(t: number, p0: Point, p1: Point, p2: Point): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

export function isPointNearBezier(
  pt: Point,
  p0: Point,
  p1: Point,
  p2: Point,
  threshold = 22
): boolean {
  const samples = 24;
  for (let i = 0; i <= samples; i++) {
    const sample = getBezierPoint(i / samples, p0, p1, p2);
    if (dist(pt, sample) < threshold) return true;
  }
  return false;
}

export function getObjectMatchKey(obj: PlayObject): string {
  return `${obj.id}_${obj.type}`;
}

/**
 * Matches objects in endFrame to their corresponding starting objects in startFrame.
 * Priority:
 *  1. Exact id + type match
 *  2. Single ball-to-ball fallback
 *  3. Nearest-neighbor matching for remaining unmapped balls
 */
export function buildObjectMatchMap(
  startFrame: FrameData,
  endFrame: FrameData
): Map<string, PlayObject> {
  const matchMap = new Map<string, PlayObject>();
  const usedStartKeys = new Set<string>();

  for (const endObj of endFrame.objects) {
    const startObj = startFrame.objects.find(
      (o) => o.id === endObj.id && o.type === endObj.type
    );
    if (startObj) {
      matchMap.set(getObjectMatchKey(endObj), startObj);
      usedStartKeys.add(getObjectMatchKey(startObj));
    }
  }

  const startBalls = startFrame.objects.filter((o) => o.type === 'Ball');
  const endBalls = endFrame.objects.filter((o) => o.type === 'Ball');

  if (startBalls.length === 1 && endBalls.length === 1) {
    const s = startBalls[0];
    const e = endBalls[0];
    if (!matchMap.has(getObjectMatchKey(e))) {
      matchMap.set(getObjectMatchKey(e), s);
      usedStartKeys.add(getObjectMatchKey(s));
    }
  }

  const unmappedEndBalls = endFrame.objects.filter(
    (o) => o.type === 'Ball' && !matchMap.has(getObjectMatchKey(o))
  );
  const unmappedStartBalls = startFrame.objects.filter(
    (o) => o.type === 'Ball' && !usedStartKeys.has(getObjectMatchKey(o))
  );

  for (const endBall of unmappedEndBalls) {
    let bestMatch: PlayObject | null = null;
    let minDst = Infinity;
    for (const startBall of unmappedStartBalls) {
      const d = dist(endBall, startBall);
      if (d < minDst) {
        minDst = d;
        bestMatch = startBall;
      }
    }
    if (bestMatch) {
      matchMap.set(getObjectMatchKey(endBall), bestMatch);
      usedStartKeys.add(getObjectMatchKey(bestMatch));
      const idx = unmappedStartBalls.indexOf(bestMatch);
      if (idx > -1) unmappedStartBalls.splice(idx, 1);
    }
  }

  return matchMap;
}

export function calculateAnimatedPosition(
  ease: number,
  startObj: PlayObject,
  endObj: PlayObject,
  startFrame: FrameData
): Point {
  let matchingLine: Line | null = null;
  let minDistance = Infinity;

  for (const line of startFrame.lines) {
    const distStart = dist(startObj, line.p0);
    const distEnd = dist(endObj, line.p2);

    if (distStart < 135 && distEnd < 135) {
      const isPlayer = startObj.type === 'O' || startObj.type === 'X';
      const isBall = startObj.type === 'Ball';

      let isValid = false;
      if (line.type === 'move' || line.type === 'screen') {
        isValid = isPlayer;
      } else if (line.type === 'pass' || line.type === 'shoot') {
        isValid = isBall;
      } else if (line.type === 'dribble') {
        isValid = true;
      }

      if (isValid && distStart + distEnd < minDistance) {
        minDistance = distStart + distEnd;
        matchingLine = line;
      }
    }
  }

  if (matchingLine) {
    return getBezierPoint(ease, startObj, matchingLine.p1, endObj);
  }

  return {
    x: lerp(startObj.x, endObj.x, ease),
    y: lerp(startObj.y, endObj.y, ease),
  };
}

export function interpolateFrameObjects(
  startFrame: FrameData,
  endFrame: FrameData,
  matchMap: Map<string, PlayObject>,
  progress: number
): PlayObject[] {
  const ease = easeInOutCubic(Math.max(0, Math.min(1, progress)));
  return endFrame.objects.map((endObj) => {
    const startObj = matchMap.get(getObjectMatchKey(endObj));
    if (startObj) {
      const pt = calculateAnimatedPosition(ease, startObj, endObj, startFrame);
      return { ...endObj, x: pt.x, y: pt.y, scale: 1 };
    }
    return { ...endObj, scale: 1 };
  });
}
