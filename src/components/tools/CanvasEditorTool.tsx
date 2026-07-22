import React, { useState, useRef, useEffect, useCallback, useMemo, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  Pen, Eraser, PaintBucket, Palette, Pipette, Square, Circle as CircleIcon,
  Wand2, Undo2, Redo2, RotateCcw, Save, ZoomIn, ZoomOut,
  Crop as CropIcon, Check as CheckIcon, ImageIcon, Grid3X3, ArrowLeft
} from 'lucide-react';
import { useAppStore } from '../../store';
import { loadImage, canvasToBlob, dataUrlToBlob } from '../../utils/media';
import { createGridRects, normalizeGridAxisBoundaries, normalizeGridSplitOptions, splitCanvasIntoGridFrames } from '../../utils/gridExtractor';
import { clientPointToSourcePixel, moveGridBoundary } from '../../utils/gridGuides';
import { finiteOr } from '../../utils/numbers';
import {
  clampPixelRect, colorToHex, displayCropToPixelRect, floodFill, replaceColor, hexToColor,
  hexWithAlpha, isPointInBounds, opacityToByte, cropToCanvas, type PixelRect
} from '../../utils/canvasEditor';
import { SLIDER_STYLES, HEADING } from '../ui';
import { assetFromFile } from '../../utils/assets';
import type { ToastType } from '../Toast';

const MAX_HISTORY_DEPTH = 15;

type Tool = 'pen' | 'eraser' | 'fill' | 'replace' | 'eyedropper' | 'rect' | 'circle' | 'soften' | 'crop' | 'grid';
type BlendMode = 'source-over' | 'overlay' | 'color-dodge' | 'color-burn';
type OnionMode = 'none' | 'previous' | 'next';
type ShapeMode = 'stroke' | 'fill' | 'both';

const COLOR_PRESETS = ['#ef4444', '#ffffff', '#000000', '#6366f1', '#38bdf8', '#8b5cf6', '#f59e0b'];

const DRAW_TOOLS: { id: Tool; icon: typeof Pen; labelKey: string }[] = [
  { id: 'pen', icon: Pen, labelKey: 'editor.tool_pen' },
  { id: 'eraser', icon: Eraser, labelKey: 'editor.tool_eraser' },
  { id: 'fill', icon: PaintBucket, labelKey: 'editor.tool_fill' },
  { id: 'replace', icon: Palette, labelKey: 'editor.tool_replace' },
  { id: 'eyedropper', icon: Pipette, labelKey: 'editor.tool_eyedropper' },
  { id: 'rect', icon: Square, labelKey: 'editor.tool_rect' },
  { id: 'circle', icon: CircleIcon, labelKey: 'editor.tool_circle' },
  { id: 'soften', icon: Wand2, labelKey: 'editor.tool_soften' },
];

const BLEND_MODES: { id: BlendMode; labelKey: string }[] = [
  { id: 'source-over', labelKey: 'editor.blend_normal' },
  { id: 'overlay', labelKey: 'editor.blend_overlay' },
  { id: 'color-dodge', labelKey: 'editor.blend_dodge' },
  { id: 'color-burn', labelKey: 'editor.blend_burn' },
];


const clampScale = (value: number) => Math.max(0.1, Math.min(value, 5));

function SliderRow({ label, value, suffix, min, max, step, onChange }: any) {
  return (
    <fieldset>
      <div className="flex justify-between items-center mb-2">
        <legend className="text-sm text-muted">{label}</legend>
        <span className="text-xs font-mono text-muted tabular-nums">{value}{suffix}</span>
      </div>
      <div className="px-2 pt-1 pb-2">
        <Slider min={min} max={max} step={step} value={value} onChange={(v) => onChange(v as number)} styles={SLIDER_STYLES} />
      </div>
    </fieldset>
  );
}

interface CanvasEditorToolProps {
  onPushToast: (type: ToastType, message: string) => void;
  onBack: () => void;
}

export function CanvasEditorTool({ onPushToast, onBack }: CanvasEditorToolProps) {
  const { t } = useTranslation();
  const { 
    frames, setFrames, assetLibrary, setAssetLibrary,
    editingFrameId, setEditingFrameId, editingAssetId, setEditingAssetId,
    setCanvasDirty,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const blurredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridOverlayRef = useRef<HTMLDivElement>(null);
  const gridPreviewFrameRef = useRef<number | null>(null);

  const [activeTool, setActiveToolState] = useState<Tool>('pen');
  const [brushSize, setBrushSize] = useState<number>(10);
  const [brushHardness, setBrushHardness] = useState<number>(100);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [tolerance, setTolerance] = useState<number>(30);
  const [blendMode, setBlendMode] = useState<BlendMode>('source-over');
  const [color, setColor] = useState<string>('#c00000');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [onionMode, setOnionMode] = useState<OnionMode>('none');
  const [onionOpacity, setOnionOpacity] = useState(35);
  const [shapeMode, setShapeMode] = useState<ShapeMode>('stroke');
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [gridPadding, setGridPadding] = useState(2);
  const [gridXBoundaries, setGridXBoundaries] = useState<number[]>([]);
  const [gridYBoundaries, setGridYBoundaries] = useState<number[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<{ axis: 'x' | 'y'; index: number } | null>(null);
  const [gridPreviewRevision, setGridPreviewRevision] = useState(0);

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);
  // Mirror local isDirty into the store only on transitions, so App can guard
  // cross-component navigation without every drawing stroke re-rendering store
  // subscribers.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (isDirty === dirtyRef.current) return;
    dirtyRef.current = isDirty;
    setCanvasDirty(isDirty);
  }, [isDirty, setCanvasDirty]);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);

  const [crop, setCrop] = useState<Crop>();
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  
  const [isDragOver, setIsDragOver] = useState(false);

  const frameIndex = editingFrameId ? frames.findIndex((f) => f.id === editingFrameId) : -1;
  const currentFrame = frameIndex >= 0 ? frames[frameIndex] : null;
  const currentAsset = editingAssetId ? assetLibrary.find((a) => a.id === editingAssetId) : null;
  const currentAssetBlob = currentAsset?.blob;
  const hasFrame = !!currentFrame;

  // Frame sources (currentFrame.dataUrl) are borrowed from the store — the
  // gallery, filmstrip, exporters and matting all read them — so they must
  // NEVER be revoked here. We only mint and own an object URL for asset editing,
  // and create + revoke it inside a single effect so React StrictMode's
  // setup→cleanup→setup recreates a fresh, valid URL instead of revoking the
  // one currently displayed.
  const [assetSourceUrl, setAssetSourceUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (hasFrame || !currentAssetBlob) {
      setAssetSourceUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(currentAssetBlob);
    setAssetSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [hasFrame, currentAssetBlob]);
  const activeSourceUrl = currentFrame ? currentFrame.dataUrl : assetSourceUrl;
  
  const previousFrame = frameIndex > 0 ? frames[frameIndex - 1] : null;
  const nextFrame = frameIndex >= 0 && frameIndex < frames.length - 1 ? frames[frameIndex + 1] : null;

  const toolProps: any = {
    pen: { color: true, size: true, hardness: true, opacity: true, blend: true },
    eraser: { size: true, opacity: true },
    fill: { color: true, opacity: true, tolerance: true },
    replace: { color: true, opacity: true, tolerance: true },
    eyedropper: {},
    rect: { color: true, size: true, opacity: true },
    circle: { color: true, size: true, opacity: true },
    soften: { size: true, hardness: true },
    crop: {},
    grid: {},
  };
  const props = toolProps[activeTool] ?? {};
  const showColor = !!props.color;
  const showSize = !!props.size;
  const showHardness = !!props.hardness;
  const showOpacity = !!props.opacity;
  const showTolerance = !!props.tolerance;
  const showBlend = !!props.blend;
  const hasCropSelection = activeTool === 'crop' && !!crop && !!crop.width && !!crop.height;
  const cropPixelRect = hasCropSelection && canvasDimensions.width > 0
    ? displayCropToPixelRect(crop, scale, canvasDimensions.width, canvasDimensions.height)
    : null;
  const onionFrame = onionMode === 'previous' ? previousFrame : onionMode === 'next' ? nextFrame : null;

  useEffect(() => {
    if (canvasDimensions.width) setGridXBoundaries(normalizeGridAxisBoundaries(canvasDimensions.width, gridCols));
  }, [canvasDimensions.width, gridCols]);

  useEffect(() => {
    if (canvasDimensions.height) setGridYBoundaries(normalizeGridAxisBoundaries(canvasDimensions.height, gridRows));
  }, [canvasDimensions.height, gridRows]);

  const { gridFrameCount, gridCellRects, gridPreviewRects, gridOptions } = useMemo(() => {
    const normalized = normalizeGridSplitOptions({ rows: gridRows, cols: gridCols, padding: gridPadding });
    const xBoundaries = normalizeGridAxisBoundaries(canvasDimensions.width || 1, normalized.cols, gridXBoundaries);
    const yBoundaries = normalizeGridAxisBoundaries(canvasDimensions.height || 1, normalized.rows, gridYBoundaries);
    const showGridPreview = activeTool === 'grid' && canvasDimensions.width > 0 && canvasDimensions.height > 0;
    const options = { ...normalized, xBoundaries, yBoundaries };
    const previewRects = showGridPreview ? createGridRects(canvasDimensions.width, canvasDimensions.height, options) : [];
    return {
      gridFrameCount: previewRects.length,
      gridCellRects: showGridPreview && normalized.padding > 0
        ? createGridRects(canvasDimensions.width, canvasDimensions.height, { ...options, padding: 0 })
        : [],
      gridPreviewRects: previewRects,
      gridOptions: options,
    };
  }, [activeTool, gridRows, gridCols, gridPadding, gridXBoundaries, gridYBoundaries, canvasDimensions.width, canvasDimensions.height]);

  const gridPreviewImages = useMemo(() => {
    const canvas = canvasRef.current;
    // The revision is bumped after every canvas write and guide drag frame;
    // keeping the guard here makes that dependency explicit to hook tooling.
    if (gridPreviewRevision < 0 || activeTool !== 'grid' || !canvas) return [];
    return gridPreviewRects.map((rect) => {
      const preview = document.createElement('canvas');
      preview.width = rect.width;
      preview.height = rect.height;
      preview.getContext('2d')?.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      return preview.toDataURL('image/png');
    });
  }, [activeTool, gridPreviewRects, gridPreviewRevision]);

  const setViewportScale = useCallback((nextScale: number, anchor?: { x: number; y: number }) => {
    setScale((prevScale) => {
      const clamped = clampScale(nextScale);
      if (clamped === prevScale) return prevScale;
      const ratio = clamped / prevScale;
      setCrop((prevCrop) => prevCrop
        ? {
            ...prevCrop,
            x: prevCrop.x * ratio,
            y: prevCrop.y * ratio,
            width: prevCrop.width * ratio,
            height: prevCrop.height * ratio,
          }
        : prevCrop);
      if (anchor) {
        setPan((prevPan) => ({
          x: prevPan.x - anchor.x * (ratio - 1),
          y: prevPan.y - anchor.y * (ratio - 1),
        }));
      }
      return clamped;
    });
  }, []);

  const fitToView = useCallback(() => {
    if (!containerRef.current || !canvasDimensions.width || !canvasDimensions.height) return;
    const container = containerRef.current;
    const scaleX = (container.clientWidth - 40) / canvasDimensions.width;
    const scaleY = (container.clientHeight - 40) / canvasDimensions.height;
    setPan({ x: 0, y: 0 });
    setViewportScale(Math.min(scaleX, scaleY, 1));
  }, [canvasDimensions.height, canvasDimensions.width, setViewportScale]);

  const zoomFromClientPoint = (clientX: number, clientY: number, factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setViewportScale(scale * factor);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    setViewportScale(scale * factor, { x: clientX - rect.left, y: clientY - rect.top });
  };

  // Zoom around the viewport center, defaulting to the origin when the container
  // isn't laid out yet — avoids the NaN pan the non-null assertions produced.
  const zoomFromCenter = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    zoomFromClientPoint(rect ? rect.left + rect.width / 2 : 0, rect ? rect.top + rect.height / 2 : 0, factor);
  };

  const drawImageToCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = img.width;
    canvas.height = img.height;
    if (previewCanvasRef.current) {
      previewCanvasRef.current.width = img.width;
      previewCanvasRef.current.height = img.height;
    }
    setCanvasDimensions({ width: img.width, height: img.height });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    setGridPreviewRevision((revision) => revision + 1);
  };

  const loadImageToCanvas = (dataUrl: string) => {
    loadImage(dataUrl).then(drawImageToCanvas).catch(() => {});
  };

  const saveState = (dataUrl: string, dirty = true) => {
    setGridPreviewRevision((revision) => revision + 1);
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(dataUrl);
      if (newHistory.length > MAX_HISTORY_DEPTH) {
        newHistory.splice(1, newHistory.length - MAX_HISTORY_DEPTH);
      }
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
    setIsDirty(dirty);
  };

  const gotoHistory = useCallback((index: number) => {
    if (index < 0 || index >= history.length) return;
    setHistoryIndex(index);
    setIsDirty(index !== 0);
    loadImageToCanvas(history[index]);
  }, [history]);

  const handleUndo = useCallback(() => gotoHistory(historyIndex - 1), [gotoHistory, historyIndex]);
  const handleRedo = useCallback(() => gotoHistory(historyIndex + 1), [gotoHistory, historyIndex]);
  const handleRestore = () => gotoHistory(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      // Only handle history shortcuts while the canvas editor is the active
      // view, and defer to native undo when the user is typing in a field.
      if (useAppStore.getState().activeTool !== 'canvas-editor') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      if (key === 'z') { if (e.shiftKey) handleRedo(); else handleUndo(); }
      else if (key === 'y') handleRedo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRedo, handleUndo]);

  useEffect(() => {
    if (!activeSourceUrl) return;
    let cancelled = false;
    setHistory([]);
    setHistoryIndex(-1);
    setIsDirty(false);
    setCrop(undefined);
    setPan({ x: 0, y: 0 });
    setActiveToolState('pen');
    setOnionMode('none');
    loadImage(activeSourceUrl)
      .then((img) => {
        if (cancelled) return;
        drawImageToCanvas(img);
        const initialState = canvasRef.current!.toDataURL('image/png');
        setHistory([initialState]);
        setHistoryIndex(0);
        setIsDirty(false);
        if (containerRef.current) {
          const container = containerRef.current;
          const scaleX = (container.clientWidth - 40) / img.width;
          const scaleY = (container.clientHeight - 40) / img.height;
          setViewportScale(Math.min(scaleX, scaleY, 1));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeSourceUrl, setViewportScale]);

  const handleApplyCrop = () => {
    if (!crop || !crop.width || !crop.height || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = displayCropToPixelRect(crop, scale, canvas.width, canvas.height);
    const cropped = cropToCanvas(canvas, rect);
    if (!cropped) return;
    canvas.width = cropped.width;
    canvas.height = cropped.height;
    setCanvasDimensions({ width: cropped.width, height: cropped.height });
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(cropped, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    saveState(dataUrl, true);
    setCrop(undefined);
    onPushToast('success', t('editor.apply_crop'));
  };

  const setPixelCrop = (rect: PixelRect) => {
    if (!canvasDimensions.width || !canvasDimensions.height) return;
    const clamped = clampPixelRect(rect, canvasDimensions.width, canvasDimensions.height);
    setCrop({
      unit: 'px', x: clamped.x * scale, y: clamped.y * scale, width: clamped.width * scale, height: clamped.height * scale,
    });
  };

  const setFullCrop = () => setPixelCrop({ x: 0, y: 0, width: canvasDimensions.width, height: canvasDimensions.height });
  const centerCrop = () => {
    const base = cropPixelRect ?? { x: 0, y: 0, width: Math.max(1, Math.round(canvasDimensions.width / 2)), height: Math.max(1, Math.round(canvasDimensions.height / 2)) };
    setPixelCrop({ ...base, x: Math.round((canvasDimensions.width - base.width) / 2), y: Math.round((canvasDimensions.height - base.height) / 2) });
  };
  const squareCrop = () => {
    const base = cropPixelRect ?? { x: 0, y: 0, width: canvasDimensions.width, height: canvasDimensions.height };
    const size = Math.max(1, Math.min(base.width, base.height));
    setPixelCrop({ x: Math.round(base.x + (base.width - size) / 2), y: Math.round(base.y + (base.height - size) / 2), width: size, height: size });
  };

  const pointerClientPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } =>
    'touches' in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { x: clientX, y: clientY } = pointerClientPos(e);
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const scheduleGridPreview = useCallback(() => {
    if (gridPreviewFrameRef.current !== null) return;
    gridPreviewFrameRef.current = requestAnimationFrame(() => {
      gridPreviewFrameRef.current = null;
      setGridPreviewRevision((revision) => revision + 1);
    });
  }, []);

  useEffect(() => () => {
    if (gridPreviewFrameRef.current !== null) cancelAnimationFrame(gridPreviewFrameRef.current);
  }, []);

  const handleGuidePointerDown = (axis: 'x' | 'y', index: number, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingGuide({ axis, index });
  };

  const handleGuidePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingGuide || !gridOverlayRef.current) return;
    const sourceSize = draggingGuide.axis === 'x' ? canvasDimensions.width : canvasDimensions.height;
    const target = clientPointToSourcePixel(
      draggingGuide.axis === 'x' ? event.clientX : event.clientY,
      gridOverlayRef.current.getBoundingClientRect(),
      sourceSize,
      draggingGuide.axis,
    );
    const setBoundaries = draggingGuide.axis === 'x' ? setGridXBoundaries : setGridYBoundaries;
    setBoundaries((boundaries) => moveGridBoundary(boundaries, draggingGuide.index, target));
    scheduleGridPreview();
  };

  const stopGuideDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingGuide(null);
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (('button' in e && e.button === 1) || e.altKey) {
      setIsPanning(true);
      const { x: clientX, y: clientY } = pointerClientPos(e);
      setPanStart({ x: clientX - pan.x, y: clientY - pan.y });
      return;
    }
    const pos = getCanvasPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!isPointInBounds(pos, canvas.width, canvas.height)) return;
    if (activeTool === 'grid') return;

    if (activeTool === 'fill' || activeTool === 'replace') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const c = hexToColor(color);
      c.a = opacityToByte(brushOpacity);
      let newImgData;
      if (activeTool === 'fill') {
        newImgData = floodFill(imgData, Math.floor(pos.x), Math.floor(pos.y), c, tolerance);
      } else {
        const idx = (Math.floor(pos.y) * imgData.width + Math.floor(pos.x)) * 4;
        const targetColor = { r: imgData.data[idx], g: imgData.data[idx+1], b: imgData.data[idx+2], a: imgData.data[idx+3] };
        newImgData = replaceColor(imgData, targetColor, c, tolerance);
      }
      ctx.putImageData(newImgData, 0, 0);
      saveState(canvas.toDataURL('image/png'));
      return;
    }
    if (activeTool === 'eyedropper') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const idx = (Math.floor(pos.y) * imgData.width + Math.floor(pos.x)) * 4;
      setColor(colorToHex({ r: imgData.data[idx], g: imgData.data[idx+1], b: imgData.data[idx+2], a: imgData.data[idx+3] }));
      return;
    }
    setIsDrawing(true);
    setLastPos(pos);
    if (activeTool === 'rect' || activeTool === 'circle') setShapeStartPos(pos);
    else if (activeTool === 'soften') {
      const bCanvas = document.createElement('canvas');
      bCanvas.width = canvas.width; bCanvas.height = canvas.height;
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        bCtx.filter = `blur(${Math.max(2, brushSize / 4)}px)`;
        bCtx.drawImage(canvas, 0, 0);
      }
      blurredCanvasRef.current = bCanvas;
      draw(pos, pos, false);
    } else draw(pos, pos, false);
  };

  const draw = (start: { x: number; y: number }, end: { x: number; y: number }, isShapePreview = false) => {
    const canvas = isShapePreview ? previewCanvasRef.current : canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (isShapePreview) ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (activeTool === 'soften' && blurredCanvasRef.current) {
      const minX = Math.min(start.x, end.x) - brushSize;
      const minY = Math.min(start.y, end.y) - brushSize;
      const maxX = Math.max(start.x, end.x) + brushSize;
      const maxY = Math.max(start.y, end.y) + brushSize;
      const width = maxX - minX;
      const height = maxY - minY;
      const scratchCanvas = document.createElement('canvas');
      scratchCanvas.width = width; scratchCanvas.height = height;
      const sCtx = scratchCanvas.getContext('2d');
      if (sCtx) {
        sCtx.lineCap = 'round'; sCtx.lineJoin = 'round'; sCtx.lineWidth = brushSize;
        if (brushHardness < 100) { sCtx.shadowBlur = (100 - brushHardness) / 5; sCtx.shadowColor = 'black'; }
        sCtx.strokeStyle = 'black';
        sCtx.beginPath(); sCtx.moveTo(start.x - minX, start.y - minY); sCtx.lineTo(end.x - minX, end.y - minY); sCtx.stroke();
        sCtx.globalCompositeOperation = 'source-in';
        sCtx.drawImage(blurredCanvasRef.current, minX, minY, width, height, 0, 0, width, height);
        ctx.drawImage(scratchCanvas, minX, minY);
      }
      return;
    }
    ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize;
    if (brushHardness < 100 && activeTool !== 'eraser') { ctx.shadowBlur = (100 - brushHardness) / 5; ctx.shadowColor = color; }
    else ctx.shadowBlur = 0;
    if (activeTool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = `rgba(0,0,0,${brushOpacity / 100})`; }
    else { ctx.globalCompositeOperation = blendMode; ctx.strokeStyle = hexWithAlpha(color, brushOpacity); }
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  };

  const drawShape = (start: { x: number; y: number }, end: { x: number; y: number }, isPreview: boolean) => {
    const canvas = isPreview ? previewCanvasRef.current : canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (isPreview) ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.lineWidth = brushSize; ctx.strokeStyle = hexWithAlpha(color, brushOpacity); ctx.fillStyle = hexWithAlpha(color, brushOpacity);
    if (activeTool === 'rect') {
      const width = end.x - start.x; const height = end.y - start.y;
      if (shapeMode === 'fill' || shapeMode === 'both') ctx.fillRect(start.x, start.y, width, height);
      if (shapeMode === 'stroke' || shapeMode === 'both') ctx.strokeRect(start.x, start.y, width, height);
    } else if (activeTool === 'circle') {
      const radiusX = Math.abs(end.x - start.x) / 2; const radiusY = Math.abs(end.y - start.y) / 2;
      const centerX = Math.min(end.x, start.x) + radiusX; const centerY = Math.min(end.y, start.y) + radiusY;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      if (shapeMode === 'fill' || shapeMode === 'both') ctx.fill();
      if (shapeMode === 'stroke' || shapeMode === 'both') ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) {
      const { x: clientX, y: clientY } = pointerClientPos(e);
      setPan({ x: clientX - panStart.x, y: clientY - panStart.y });
      return;
    }
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    if (activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'soften') {
       draw(lastPos, pos, false); setLastPos(pos);
    } else if (activeTool === 'rect' || activeTool === 'circle') {
       if (shapeStartPos) drawShape(shapeStartPos, pos, true);
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    if (!isDrawing) return;
    setIsDrawing(false);
    const pos = getCanvasPos(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && shapeStartPos && (activeTool === 'rect' || activeTool === 'circle')) {
      if (previewCanvasRef.current) previewCanvasRef.current.getContext('2d')?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
      drawShape(shapeStartPos, pos, false);
      setShapeStartPos(null);
    }
    if (canvas && (activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'rect' || activeTool === 'circle' || activeTool === 'soften')) {
       saveState(canvas.toDataURL('image/png'));
    }
    if (activeTool === 'soften') blurredCanvasRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomFromClientPoint(e.clientX, e.clientY, zoomFactor);
    }
  };

  // Write the current canvas back to the store. Returns false if there was
  // nothing to write or encoding failed; never navigates away.
  const persistCanvas = async (): Promise<boolean> => {
    if (!canvasRef.current) return false;
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;

    if (editingFrameId) {
      // Frames store a data-URL string, so encode straight to one.
      const newDataUrl = canvas.toDataURL('image/png');
      setFrames(useAppStore.getState().frames.map(f => f.id === editingFrameId ? {
        ...f, dataUrl: newDataUrl, sourceDataUrl: undefined, width, height,
      } : f));
      setIsDirty(false);
      onPushToast('success', t('app.frame_saved'));
      return true;
    }

    // Assets store a Blob/File — encode straight to a Blob via toBlob (no
    // base64 round-trip). Read the target id live and patch via the functional
    // updater so a concurrent library edit during the encode isn't clobbered.
    const targetAssetId = useAppStore.getState().editingAssetId;
    if (targetAssetId) {
      const blob = await canvasToBlob(canvas);
      if (!blob) {
        onPushToast('error', t('app.save_failed'));
        return false;
      }
      const file = new File([blob], currentAsset?.name || 'edited.png', { type: 'image/png' });
      setAssetLibrary(prev => prev.map(a => a.id === targetAssetId ? { ...a, blob, file, width, height } : a));
      setIsDirty(false);
      onPushToast('success', t('app.frame_saved'));
      return true;
    }
    return false;
  };

  const handleSave = async () => {
    if (await persistCanvas()) onBack();
  };

  const handleSplitGrid = () => {
    if (!activeSourceUrl || !canvasRef.current) return;
    const splitFrames = splitCanvasIntoGridFrames(canvasRef.current, gridOptions, {
      startTime: currentFrame ? currentFrame.time : 0,
      timeStep: 0.1,
    });
    
    setIsDirty(false);
    
    if (editingFrameId) {
      const idx = frames.findIndex((f) => f.id === editingFrameId);
      if (idx !== -1) {
        setFrames([
          ...frames.slice(0, idx),
          ...splitFrames,
          ...frames.slice(idx + 1),
        ]);
        setEditingFrameId(splitFrames[0]?.id ?? null);
        onPushToast('success', t('app.success_split', { count: splitFrames.length, s: splitFrames.length === 1 ? '' : 's' }));
      }
    } else if (editingAssetId) {
       const newAssets = splitFrames.map((f, i) => {
          const file = new File([dataUrlToBlob(f.dataUrl)], `${currentAsset?.name || 'grid'}_part${i}.png`, { type: 'image/png' });
          const asset = assetFromFile(file);
          asset.width = f.width ?? 0;
          asset.height = f.height ?? 0;
          return asset;
       });
       setAssetLibrary([...assetLibrary, ...newAssets]);
       setEditingAssetId(null);
       onPushToast('success', t('app.success_split', { count: splitFrames.length, s: '' }));
    }
  };

  const saveAndSwitchToFrame = async (nextFrameId: string | null) => {
    if (isDirty) await persistCanvas();
    setEditingAssetId(null);
    setEditingFrameId(nextFrameId);
  };

  const toolButtonClass = (active: boolean) =>
    `group relative grid place-items-center w-11 h-11 rounded-control transition-colors ${
      active ? 'bg-primary text-white shadow-[0_0_16px_var(--accent-glow)]' : 'text-muted hover:text-foreground hover:bg-white/5'
    }`;

  const HIST_BTN =
    'flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-control text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted';

  const cursorFor = (): string => {
    if (isPanning) return 'grab';
    if (activeTool === 'grid') return 'default';
    if (activeTool === 'fill' || activeTool === 'replace' || activeTool === 'eyedropper') return 'pointer';
    return 'crosshair';
  };
  
  // Add an image to the library and load it onto the canvas.
  const openFileInCanvas = (file: File) => {
    const asset = assetFromFile(file);
    setAssetLibrary((prev) => [...prev, asset]);
    setEditingFrameId(null);
    setEditingAssetId(asset.id);
    return asset;
  };

  const handleEmptyDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
        const asset = openFileInCanvas(file);
        onPushToast('success', t('app.success_loaded', { filename: asset.name }));
    } else {
        onPushToast('error', t('app.error_unsupported'));
    }
  };

  if (!activeSourceUrl) {
    return (
      <div className="flex-1 min-h-0 w-full flex flex-col">
          <div className="w-full max-w-xl mx-auto flex flex-col mt-4 sm:mt-12 overflow-visible justify-center flex-1">
             <div className="glass-panel rounded-card p-5">
              <h2 className={HEADING}>
                <Palette className="w-5 h-5 text-primary" aria-hidden="true" /> {t('tools.canvas_editor')}
              </h2>
              <label
                onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleEmptyDrop}
                className={`group relative flex flex-col items-center justify-center rounded-control border-2 border-dashed text-center cursor-pointer transition-colors min-h-[250px] p-6 ${
                  isDragOver ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_var(--accent-glow)]' : 'border-hairline-strong hover:border-primary/50 hover:bg-white/[0.02]'
                }`}
              >
                <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) openFileInCanvas(file);
                }} className="peer sr-only" />
                <ImageIcon className={`w-10 h-10 mb-3 transition-colors ${isDragOver ? 'text-primary' : 'text-muted group-hover:text-primary'}`} />
                <span className="text-base font-medium text-foreground mb-1">{t('editor.empty_title')}</span>
                <span className="text-sm text-muted/80 max-w-sm leading-relaxed">{t('editor.empty_desc')}</span>
              </label>
             </div>
          </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-background/50 backdrop-blur-md rounded-card border border-hairline overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-hairline bg-surface/30 shrink-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <button type="button" onClick={() => { if (isDirty && !window.confirm(t('editor.discard'))) return; onBack(); }} className="min-h-11 -ml-2 px-2 rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-1.5 shrink-0" aria-label={t('editor.back_to_studio', 'Back to Sticker Studio')}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('editor.back_to_studio', 'Back to Sticker Studio')}</span>
            </button>
            <span className="truncate">{t('editor.edit_title')}</span>
            <span className="font-mono text-xs text-muted">
              {editingFrameId ? (frameIndex >= 0 ? `Frame ${frameIndex + 1}` : '') : currentAsset?.name}
            </span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Unsaved changes" />}
          </h2>

          <div className="flex items-center gap-1">
            <button type="button" onClick={handleUndo} disabled={historyIndex <= 0} className={HIST_BTN} title={t('editor.undo_title')}>
              <Undo2 className="w-4 h-4" /> <span className="hidden sm:inline">{t('editor.undo')}</span>
            </button>
            <button type="button" onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={HIST_BTN} title={t('editor.redo_title')}>
              <Redo2 className="w-4 h-4" /> <span className="hidden sm:inline">{t('editor.redo')}</span>
            </button>
            <button type="button" onClick={handleRestore} disabled={historyIndex <= 0} className={HIST_BTN} title={t('editor.restore')}>
              <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">{t('editor.restore')}</span>
            </button>
            <span className="mx-1 h-5 w-px bg-hairline" />
            <button type="button" onClick={handleSave} className="min-h-[36px] px-4 rounded-control bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <Save className="w-4 h-4" /> {t('editor.save_close')}
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-row relative">
          {/* Tool rail */}
          <nav className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-hairline bg-surface/50 overflow-y-auto custom-scrollbar z-10">
            {DRAW_TOOLS.map((t_item) => (
              <button key={t_item.id} type="button" onClick={() => setActiveToolState(t_item.id)} className={toolButtonClass(activeTool === t_item.id)} title={t(t_item.labelKey)}>
                <t_item.icon className="w-5 h-5" />
              </button>
            ))}
            <span className="my-1 h-px w-7 bg-hairline" />
            <button type="button" onClick={() => setActiveToolState('crop')} className={toolButtonClass(activeTool === 'crop')} title={t('editor.crop')}>
              <CropIcon className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setActiveToolState('grid')} className={toolButtonClass(activeTool === 'grid')} title={t('editor.grid_split', 'Grid Split')}>
              <Grid3X3 className="w-5 h-5" />
            </button>
          </nav>

          {/* Canvas */}
          <div ref={containerRef} className="frame-checker flex-1 relative overflow-hidden flex items-center justify-center select-none z-0" onWheel={handleWheel}>
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0', cursor: cursorFor(), position: 'relative', width: canvasDimensions.width * scale, height: canvasDimensions.height * scale }}>
              <canvas ref={canvasRef} className="bg-transparent" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} style={{ touchAction: 'none', width: '100%', height: '100%' }} />
              <canvas ref={previewCanvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />
              {onionFrame && (
                <img src={onionFrame.dataUrl} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: onionOpacity / 100, mixBlendMode: 'difference' }} />
              )}
              {activeTool === 'crop' && canvasDimensions.width > 0 && (
                <div className="absolute inset-0 z-10">
                  <ReactCrop crop={crop} onChange={(c) => setCrop(c)} style={{ width: '100%', height: '100%' }}>
                    <div style={{ width: canvasDimensions.width * scale, height: canvasDimensions.height * scale, opacity: 0 }} />
                  </ReactCrop>
                </div>
              )}
              {activeTool === 'grid' && gridCellRects.map((rect, i) => (
                <div key={i} className="absolute border border-primary/50 bg-primary/10 pointer-events-none" style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }} />
              ))}
              {activeTool === 'grid' && gridPreviewRects.map((rect, i) => (
                <div key={i} className="absolute border border-dashed border-red-500/50 pointer-events-none" style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }} />
              ))}
              {activeTool === 'grid' && (
                <div ref={gridOverlayRef} className="absolute inset-0 z-20 pointer-events-none" aria-label={t('editor.grid_guides', 'Adjustable grid guides')}>
                  {gridOptions.xBoundaries?.slice(1, -1).map((boundary, offset) => {
                    const index = offset + 1;
                    return <div key={`x-${index}`} role="slider" tabIndex={0} aria-label={t('editor.grid_vertical_guide', 'Vertical split guide')} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={canvasDimensions.width} aria-valuenow={boundary}
                      className="absolute top-0 bottom-0 -ml-2 w-4 cursor-col-resize pointer-events-auto group"
                      style={{ left: boundary * scale }} onPointerDown={(event) => handleGuidePointerDown('x', index, event)} onPointerMove={handleGuidePointerMove} onPointerUp={stopGuideDrag} onPointerCancel={stopGuideDrag} onPointerLeave={stopGuideDrag} onLostPointerCapture={stopGuideDrag}>
                      <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" />
                    </div>;
                  })}
                  {gridOptions.yBoundaries?.slice(1, -1).map((boundary, offset) => {
                    const index = offset + 1;
                    return <div key={`y-${index}`} role="slider" tabIndex={0} aria-label={t('editor.grid_horizontal_guide', 'Horizontal split guide')} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={canvasDimensions.height} aria-valuenow={boundary}
                      className="absolute left-0 right-0 -mt-2 h-4 cursor-row-resize pointer-events-auto group"
                      style={{ top: boundary * scale }} onPointerDown={(event) => handleGuidePointerDown('y', index, event)} onPointerMove={handleGuidePointerMove} onPointerUp={stopGuideDrag} onPointerCancel={stopGuideDrag} onPointerLeave={stopGuideDrag} onLostPointerCapture={stopGuideDrag}>
                      <span className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                      <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" />
                    </div>;
                  })}
                </div>
              )}
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 p-1 rounded-control backdrop-blur-sm shadow-sm border border-hairline z-20">
              <button type="button" onClick={() => zoomFromCenter(0.9)} className="grid place-items-center w-8 h-8 rounded-control text-muted hover:text-foreground hover:bg-white/5"><ZoomOut className="w-4 h-4" /></button>
              <span className="text-xs font-mono px-1 tabular-nums min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
              <button type="button" onClick={() => zoomFromCenter(1.1)} className="grid place-items-center w-8 h-8 rounded-control text-muted hover:text-foreground hover:bg-white/5"><ZoomIn className="w-4 h-4" /></button>
              <button type="button" onClick={fitToView} className="px-2 h-8 rounded-control text-xs font-medium text-muted hover:text-foreground hover:bg-white/5">{t('editor.fit')}</button>
            </div>
          </div>

          {/* Properties sidebar */}
          <aside className="w-64 shrink-0 flex flex-col border-l border-hairline bg-surface/50 p-4 overflow-y-auto custom-scrollbar z-10">
            <h3 className="text-[11px] font-semibold mb-4 uppercase tracking-wider text-muted/70">{t('editor.properties')}</h3>
            <div className="space-y-5">
              {showColor && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 relative">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 shrink-0">{t('editor.color')}</span>
                    <button type="button" onClick={() => setShowColorPicker(!showColorPicker)} className="w-8 h-8 rounded-control border border-hairline-strong shadow-inner" style={{ backgroundColor: color }} />
                    <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="w-24 px-2 py-1 bg-surface border border-hairline rounded-control text-sm font-mono text-foreground focus:border-primary" />
                    {showColorPicker && (
                      <div className="absolute top-full left-0 z-50 mt-2">
                        <div className="fixed inset-0" onClick={() => setShowColorPicker(false)} />
                        <div className="relative glass-panel rounded-control p-3 shadow-pop"><HexColorPicker color={color} onChange={setColor} /></div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button key={c} type="button" onClick={() => setColor(c)} className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${color.toLowerCase() === c ? 'border-primary ring-2 ring-primary' : 'border-hairline-strong'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              )}
              {showSize && <SliderRow label={t('editor.brush_size')} value={brushSize} suffix="px" min={1} max={100} step={1} onChange={setBrushSize} />}
              {showHardness && <SliderRow label={t('editor.hardness')} value={brushHardness} suffix="%" min={0} max={100} step={1} onChange={setBrushHardness} />}
              {showOpacity && <SliderRow label={t('editor.opacity')} value={brushOpacity} suffix="%" min={0} max={100} step={1} onChange={setBrushOpacity} />}
              {(activeTool === 'rect' || activeTool === 'circle') && (
                <fieldset><legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">{t('editor.shape')}</legend><div className="grid grid-cols-3 gap-1">
                  {[{ id: 'stroke', label: t('editor.stroke') }, { id: 'fill', label: t('editor.fill') }, { id: 'both', label: t('editor.both') }].map((item) => (
                    <button key={item.id} type="button" onClick={() => setShapeMode(item.id as ShapeMode)} className={`min-h-[32px] rounded-control text-xs font-medium ${shapeMode === item.id ? 'bg-primary text-white' : 'bg-surface-hover text-muted hover:text-foreground'}`}>{item.label}</button>
                  ))}
                </div></fieldset>
              )}
              {showTolerance && <SliderRow label={t('editor.tolerance')} value={tolerance} min={0} max={255} step={1} onChange={setTolerance} />}
              {showBlend && (
                <fieldset><legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">{t('editor.blend_mode')}</legend><div className="grid grid-cols-2 gap-1">
                  {BLEND_MODES.map((m) => (
                    <button key={m.id} type="button" onClick={() => setBlendMode(m.id)} className={`min-h-[32px] rounded-control text-xs font-medium ${blendMode === m.id ? 'bg-primary text-white' : 'bg-surface-hover text-muted hover:text-foreground'}`}>{t(m.labelKey)}</button>
                  ))}
                </div></fieldset>
              )}
              {activeTool === 'crop' && (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('editor.crop')}</p>
                  <div className="grid grid-cols-3 gap-1">
                    <button type="button" onClick={setFullCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground">{t('editor.full')}</button>
                    <button type="button" onClick={centerCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground">{t('editor.center')}</button>
                    <button type="button" onClick={squareCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground">{t('editor.ratio_1_1')}</button>
                  </div>
                  {hasCropSelection && (
                    <button type="button" onClick={handleApplyCrop} className="w-full min-h-[40px] rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_16px_var(--accent-glow)]"><CheckIcon className="w-4 h-4" /> {t('editor.apply_crop')}</button>
                  )}
                </div>
              )}
              {activeTool === 'grid' && (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('editor.grid_split', 'Grid Split')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <label><span className="block text-[10px] text-muted">{t('editor.rows', 'Rows')}</span><input type="number" min={1} max={20} value={gridRows} onChange={(e) => setGridRows(finiteOr(e.currentTarget.valueAsNumber, 1))} className="w-full px-2 py-1 bg-surface border border-hairline rounded-control text-xs font-mono text-foreground focus:border-primary transition-colors" /></label>
                    <label><span className="block text-[10px] text-muted">{t('editor.cols', 'Cols')}</span><input type="number" min={1} max={20} value={gridCols} onChange={(e) => setGridCols(finiteOr(e.currentTarget.valueAsNumber, 1))} className="w-full px-2 py-1 bg-surface border border-hairline rounded-control text-xs font-mono text-foreground focus:border-primary transition-colors" /></label>
                    <label><span className="block text-[10px] text-muted">{t('editor.pad', 'Pad')}</span><input type="number" min={0} max={200} value={gridPadding} onChange={(e) => setGridPadding(finiteOr(e.currentTarget.valueAsNumber, 0))} className="w-full px-2 py-1 bg-surface border border-hairline rounded-control text-xs font-mono text-foreground focus:border-primary transition-colors" /></label>
                  </div>
                  <p className="text-[10px] text-muted">{t('editor.grid_drag_hint', 'Drag the blue guides on the canvas to fine-tune each split.')}</p>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">{t('editor.grid_preview', 'Split preview')} · {gridFrameCount}</p>
                    <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                      {gridPreviewImages.map((src, index) => {
                        const rect = gridPreviewRects[index];
                        return <figure key={`${src.slice(-16)}-${index}`} className="min-w-0">
                          <img src={src} alt={t('editor.grid_preview_item', { index: index + 1 })} className="aspect-square w-full rounded-sm border border-hairline object-cover bg-background" />
                          <figcaption className="mt-0.5 truncate text-[9px] font-mono text-muted">{index + 1} · {rect.width}×{rect.height}</figcaption>
                        </figure>;
                      })}
                    </div>
                  </div>
                  <button type="button" onClick={handleSplitGrid} className="w-full min-h-[40px] rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-1.5"><Grid3X3 className="w-4 h-4" /> {t('editor.split_frames', { count: gridFrameCount })}</button>
                </div>
              )}
              {editingFrameId && (previousFrame || nextFrame) && (
                <fieldset className="space-y-3"><legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('editor.onion_skin')}</legend><div className="grid grid-cols-3 gap-1">
                  {[{ id: 'none', label: t('editor.off'), disabled: false }, { id: 'previous', label: t('editor.prev'), disabled: !previousFrame }, { id: 'next', label: t('editor.next'), disabled: !nextFrame }].map((item) => (
                    <button key={item.id} type="button" disabled={item.disabled} onClick={() => setOnionMode(item.id as OnionMode)} className={`min-h-[32px] rounded-control text-xs font-medium disabled:opacity-40 ${onionMode === item.id ? 'bg-primary text-white' : 'bg-surface-hover text-muted hover:text-foreground'}`}>{item.label}</button>
                  ))}
                </div>
                {onionMode !== 'none' && <SliderRow label={t('editor.overlay_opacity')} value={onionOpacity} suffix="%" min={5} max={80} step={1} onChange={setOnionOpacity} />}
                </fieldset>
              )}
            </div>
          </aside>
        </div>

        {/* Bottom Filmstrip - Only show if editing a sequence frame */}
        {editingFrameId && frames.length > 0 && (
          <div className="h-24 shrink-0 border-t border-hairline bg-surface/30 px-4 flex items-center overflow-x-auto custom-scrollbar gap-2 z-10">
            {frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => saveAndSwitchToFrame(f.id)}
                className={`shrink-0 h-16 rounded-lg overflow-hidden border-2 transition-all duration-150 ${f.id === editingFrameId ? 'border-primary ring-2 ring-primary/50 shadow-[0_0_12px_var(--accent-glow)]' : 'border-hairline hover:border-primary/50 opacity-60 hover:opacity-100'}`}
                style={{ aspectRatio: `${f.width ?? 16} / ${f.height ?? 9}` }}
              >
                <img src={f.dataUrl} alt={`Frame ${i}`} className="w-full h-full object-contain bg-black/20 frame-checker" />
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
