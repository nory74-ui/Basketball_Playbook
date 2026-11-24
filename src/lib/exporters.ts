import { jsPDF } from 'jspdf';
import * as Mp4Muxer from 'mp4-muxer';
import { CourtType, FrameData } from '../types';
import { buildObjectMatchMap, interpolateFrameObjects } from './animation';
import { CANVAS_WIDTH, getCanvasHeight, renderScene, wrapCanvasText } from './renderer';

export interface ExportProgressCallback {
  (progress: number, statusText: string): void;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return cleaned || 'play';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function renderPdfHeaderImage(
  playName: string,
  courtType: CourtType,
  pageNum: number,
  totalPages: number
): string {
  const w = 1600;
  const h = 110;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 46px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const title = playName.trim() || '新しいプレイ';
  ctx.fillText(title, 0, 48, 1180);

  ctx.fillStyle = '#6b7280';
  ctx.font = '500 28px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'right';
  const courtLabel = courtType === 'full' ? 'フルコート' : 'ハーフコート';
  ctx.fillText(`${courtLabel}  |  ${pageNum} / ${totalPages}`, w, 50);

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h - 6);
  ctx.lineTo(w, h - 6);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Renders the frame caption ("Frame N" + optional Japanese tactical note) via canvas
 * so Japanese characters wrap cleanly and never garble in jsPDF.
 */
function renderPdfFrameCaption(frameNum: number, note?: string): { dataUrl: string; heightMm: number } {
  const trimmed = (note || '').trim();
  const w = 900;
  const h = trimmed ? 120 : 48;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 28px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`Frame ${frameNum}`, w / 2, 4);

  if (trimmed) {
    ctx.fillStyle = '#374151';
    ctx.font = '500 25px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
    const lines = wrapCanvasText(ctx, trimmed, w - 32, 2);
    lines.forEach((line, idx) => {
      ctx.fillText(line, w / 2, 42 + idx * 34, w - 24);
    });
    return { dataUrl: canvas.toDataURL('image/png'), heightMm: 12 };
  }

  return { dataUrl: canvas.toDataURL('image/png'), heightMm: 5.5 };
}

export async function exportPlayToPDF(
  frames: FrameData[],
  courtType: CourtType,
  playName: string,
  onProgress?: ExportProgressCallback
): Promise<void> {
  if (frames.length === 0) {
    throw new Error('出力するフレームがありません');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 14;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2 - headerHeight;
  const cols = 2;
  const rows = 3;
  const perPage = cols * rows;
  const totalPages = Math.ceil(frames.length / perPage);
  const cellWidth = contentWidth / cols;
  const cellHeight = contentHeight / rows;
  const cellPad = 3.5;

  const sceneWidth = CANVAS_WIDTH;
  const sceneHeight = getCanvasHeight(courtType);

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = sceneWidth;
  renderCanvas.height = sceneHeight;
  const renderCtx = renderCanvas.getContext('2d')!;

  const targetWidth = 1000;
  const scaleFactor = targetWidth / sceneWidth;
  const targetHeight = Math.round(sceneHeight * scaleFactor);

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = targetWidth;
  scaledCanvas.height = targetHeight;
  const scaledCtx = scaledCanvas.getContext('2d')!;

  for (let i = 0; i < frames.length; i++) {
    onProgress?.(Math.round(((i + 1) / frames.length) * 100), 'PDFを作成中...');

    if (i > 0 && i % perPage === 0) {
      doc.addPage();
    }

    if (i % perPage === 0) {
      const pageNum = Math.floor(i / perPage) + 1;
      const headerImg = renderPdfHeaderImage(playName, courtType, pageNum, totalPages);
      doc.addImage(headerImg, 'PNG', margin, margin, contentWidth, headerHeight - 1);
    }

    renderScene(renderCtx, {
      courtType,
      width: sceneWidth,
      height: sceneHeight,
      frame: frames[i],
    });

    scaledCtx.fillStyle = '#ffffff';
    scaledCtx.fillRect(0, 0, targetWidth, targetHeight);
    scaledCtx.drawImage(renderCanvas, 0, 0, targetWidth, targetHeight);
    const imgData = scaledCanvas.toDataURL('image/jpeg', 0.85);

    const caption = renderPdfFrameCaption(i + 1, frames[i].note);

    const posInPage = i % perPage;
    const col = posInPage % cols;
    const row = Math.floor(posInPage / cols);
    const xBase = margin + col * cellWidth;
    const yBase = margin + headerHeight + row * cellHeight;

    const availW = cellWidth - cellPad * 2;
    const availH = cellHeight - cellPad * 2 - caption.heightMm - 1;

    const imgRatio = targetWidth / targetHeight;
    const boxRatio = availW / availH;

    let finalW: number;
    let finalH: number;
    if (imgRatio > boxRatio) {
      finalW = availW;
      finalH = availW / imgRatio;
    } else {
      finalH = availH;
      finalW = availH * imgRatio;
    }

    const xImg = xBase + cellPad + (availW - finalW) / 2;
    const yImg = yBase + cellPad + (availH - finalH) / 2;

    doc.addImage(imgData, 'JPEG', xImg, yImg, finalW, finalH);
    doc.addImage(
      caption.dataUrl,
      'PNG',
      xBase + cellPad,
      yBase + cellHeight - caption.heightMm - 1.5,
      availW,
      caption.heightMm
    );

    await new Promise((r) => setTimeout(r, 0));
  }

  doc.save(`${sanitizeFileName(playName)}_${Date.now()}.pdf`);
}

export async function exportPlayToVideo(
  frames: FrameData[],
  courtType: CourtType,
  playName: string,
  playbackSpeed: number,
  onProgress?: ExportProgressCallback
): Promise<'mp4' | 'webm'> {
  if (frames.length < 2) {
    throw new Error('動画を出力するには2フレーム以上必要です');
  }

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIOS && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined') {
    try {
      await exportVideoWebCodecs(frames, courtType, playName, playbackSpeed, onProgress);
      return 'mp4';
    } catch (err) {
      console.warn('WebCodecs MP4 export failed, falling back to MediaRecorder:', err);
    }
  }

  return await exportVideoMediaRecorder(frames, courtType, playName, playbackSpeed, onProgress);
}

async function exportVideoWebCodecs(
  frames: FrameData[],
  courtType: CourtType,
  playName: string,
  playbackSpeed: number,
  onProgress?: ExportProgressCallback
): Promise<void> {
  const sceneWidth = Math.floor(CANVAS_WIDTH / 2) * 2;
  const sceneHeight = Math.floor(getCanvasHeight(courtType) / 2) * 2;

  const offscreen = document.createElement('canvas');
  offscreen.width = sceneWidth;
  offscreen.height = sceneHeight;
  const ctx = offscreen.getContext('2d')!;

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: sceneWidth, height: sceneHeight },
    fastStart: 'in-memory',
  });

  const fps = 30;
  const bitrate = 5_000_000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const VideoEncoderCtor = (window as any).VideoEncoder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const VideoFrameCtor = (window as any).VideoFrame;

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoderCtor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (e: any) => {
      encoderError = new Error('Encoding Error: ' + (e?.message || String(e)));
    },
  });

  const candidateCodecs = ['avc1.640033', 'avc1.4d0033', 'avc1.4d002a', 'avc1.42002a'];
  let chosenConfig: {
    codec: string;
    width: number;
    height: number;
    bitrate: number;
    framerate: number;
  } | null = null;

  for (const codec of candidateCodecs) {
    const cfg = { codec, width: sceneWidth, height: sceneHeight, bitrate, framerate: fps };
    const support = await VideoEncoderCtor.isConfigSupported(cfg);
    if (support.supported) {
      chosenConfig = cfg;
      break;
    }
  }

  if (!chosenConfig) {
    throw new Error('H.264 hardware/software encoding is not supported on this browser.');
  }

  videoEncoder.configure(chosenConfig);

  const transitionSeconds = 1.0 / Math.max(0.25, playbackSpeed);
  const framesPerTransition = Math.max(10, Math.round(fps * transitionSeconds));
  const introHoldFrames = Math.round(fps * 0.4);
  const outroHoldFrames = Math.round(fps * 1.0);
  const totalFrames = introHoldFrames + (frames.length - 1) * framesPerTransition + outroHoldFrames;

  let frameIndex = 0;

  const encodeCurrentCanvas = async () => {
    if (encoderError) throw encoderError;
    const timestamp = Math.round((frameIndex * 1e6) / fps);
    const vf = new VideoFrameCtor(offscreen, { timestamp });
    videoEncoder.encode(vf, { keyFrame: frameIndex % 30 === 0 });
    vf.close();
    frameIndex++;
    onProgress?.(Math.min(99, Math.round((frameIndex / totalFrames) * 100)), 'MP4を作成中...');
    if (frameIndex % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  try {
    renderScene(ctx, {
      courtType,
      width: sceneWidth,
      height: sceneHeight,
      frame: frames[0],
      subtitle: frames[0].note,
    });
    for (let h = 0; h < introHoldFrames; h++) {
      await encodeCurrentCanvas();
    }

    for (let i = 0; i < frames.length - 1; i++) {
      const startFrame = frames[i];
      const endFrame = frames[i + 1];
      const matchMap = buildObjectMatchMap(startFrame, endFrame);

      for (let j = 0; j < framesPerTransition; j++) {
        const progress = j / framesPerTransition;
        const animatedObjects = interpolateFrameObjects(startFrame, endFrame, matchMap, progress);
        renderScene(ctx, {
          courtType,
          width: sceneWidth,
          height: sceneHeight,
          frame: startFrame,
          animatingObjects: animatedObjects,
          subtitle: startFrame.note,
        });
        await encodeCurrentCanvas();
      }
    }

    const lastFrame = frames[frames.length - 1];
    renderScene(ctx, {
      courtType,
      width: sceneWidth,
      height: sceneHeight,
      frame: lastFrame,
      subtitle: lastFrame.note,
    });
    for (let h = 0; h < outroHoldFrames; h++) {
      await encodeCurrentCanvas();
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
  }

  muxer.finalize();
  onProgress?.(100, 'ダウンロード準備中...');

  const { buffer } = muxer.target as Mp4Muxer.ArrayBufferTarget;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  triggerDownload(blob, `${sanitizeFileName(playName)}_${Date.now()}.mp4`);
}

function exportVideoMediaRecorder(
  frames: FrameData[],
  courtType: CourtType,
  playName: string,
  playbackSpeed: number,
  onProgress?: ExportProgressCallback
): Promise<'mp4' | 'webm'> {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('お使いのブラウザは動画出力に対応していません'));
      return;
    }

    const mimeTypes = [
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));

    if (!selectedMime) {
      reject(new Error('お使いのブラウザは動画録画形式に対応していません'));
      return;
    }

    const sceneWidth = Math.floor(CANVAS_WIDTH / 2) * 2;
    const sceneHeight = Math.floor(getCanvasHeight(courtType) / 2) * 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = sceneWidth;
    offscreen.height = sceneHeight;
    const ctx = offscreen.getContext('2d')!;

    if (typeof offscreen.captureStream !== 'function') {
      reject(new Error('お使いのブラウザはキャンバス録画に対応していません'));
      return;
    }

    const stream = offscreen.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 3_500_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onerror = () => {
      reject(new Error('動画の録画中にエラーが発生しました'));
    };

    recorder.onstop = () => {
      const ext: 'mp4' | 'webm' = selectedMime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: selectedMime });
      triggerDownload(blob, `${sanitizeFileName(playName)}_${Date.now()}.${ext}`);
      resolve(ext);
    };

    const durationPerTransition = 1000 / Math.max(0.25, playbackSpeed);
    const introMs = 400;
    const outroMs = 1000;
    const totalMs = introMs + (frames.length - 1) * durationPerTransition + outroMs;

    recorder.start();
    onProgress?.(0, '動画を録画中...');

    const runTimeline = async () => {
      const startAll = performance.now();

      const waitFrame = (ms: number, renderFn: (elapsed: number) => void) =>
        new Promise<void>((res) => {
          const t0 = performance.now();
          const step = (now: number) => {
            const elapsed = now - t0;
            renderFn(Math.min(elapsed, ms));
            const overall = Math.min(99, Math.round(((now - startAll) / totalMs) * 100));
            onProgress?.(overall, '動画を録画中...');
            if (elapsed < ms) {
              requestAnimationFrame(step);
            } else {
              res();
            }
          };
          requestAnimationFrame(step);
        });

      await waitFrame(introMs, () => {
        renderScene(ctx, {
          courtType,
          width: sceneWidth,
          height: sceneHeight,
          frame: frames[0],
          subtitle: frames[0].note,
        });
      });

      for (let i = 0; i < frames.length - 1; i++) {
        const startFrame = frames[i];
        const endFrame = frames[i + 1];
        const matchMap = buildObjectMatchMap(startFrame, endFrame);

        await waitFrame(durationPerTransition, (elapsed) => {
          const progress = elapsed / durationPerTransition;
          const animatedObjects = interpolateFrameObjects(startFrame, endFrame, matchMap, progress);
          renderScene(ctx, {
            courtType,
            width: sceneWidth,
            height: sceneHeight,
            frame: startFrame,
            animatingObjects: animatedObjects,
            subtitle: startFrame.note,
          });
        });
      }

      const lastFrame = frames[frames.length - 1];
      await waitFrame(outroMs, () => {
        renderScene(ctx, {
          courtType,
          width: sceneWidth,
          height: sceneHeight,
          frame: lastFrame,
          subtitle: lastFrame.note,
        });
      });

      onProgress?.(100, '保存中...');
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    runTimeline().catch((err) => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      reject(err);
    });
  });
}
