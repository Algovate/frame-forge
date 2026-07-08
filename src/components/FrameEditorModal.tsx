import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  X,
  Pen,
  Eraser,
  PaintBucket,
  Palette,
  Pipette,
  Square,
  Circle as CircleIcon,
  Wand2, // Edge Softening
  Undo2,
  Redo2,
  RotateCcw,
  Save,
  Layers,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Crop as CropIcon,
  Check as CheckIcon,
  Grid3X3,
} from 'lucide-react';
import type { ExtractedFrame } from '../types';
import { loadImage } from '../utils/media';
import { createGridRects, normalizeGridSplitOptions, splitCanvasIntoGridFrames } from '../utils/gridExtractor';
import { finiteOr } from '../utils/numbers';
import {
  clampPixelRect,
  colorToHex,
  displayCropToPixelRect,
  floodFill,
  replaceColor,
  hexToColor,
  hexWithAlpha,
  isPointInBounds,
  opacityToByte,
  cropToCanvas,
  type Color,
  type PixelRect,
} from '../utils/canvasEditor';
import { SLIDER_STYLES } from './ui';

interface FrameEditorModalProps {
  frame: ExtractedFrame | null;
  previousFrame?: ExtractedFrame | null;
  nextFrame?: ExtractedFrame | null;
  onClose: () => void;
  onSave: (id: string, newUrl: string, meta?: { width?: number; height?: number; close?: boolean; message?: string }) => void;
  onBatchCrop?: (rect: PixelRect) => void;
  onSplitGrid?: (id: string, frames: ExtractedFrame[]) => void;
}

type Tool = 'pen' | 'eraser' | 'fill' | 'replace' | 'eyedropper' | 'rect' | 'circle' | 'soften' | 'crop' | 'grid';
type BlendMode = 'source-over' | 'overlay' | 'color-dodge' | 'color-burn';
type OnionMode = 'none' | 'previous' | 'next';
type ShapeMode = 'stroke' | 'fill' | 'both';

/** Quick color swatches for the properties panel — drawn from the app's own
 *  palette (primary / matte / dedupe / destructive) plus neutral inks. */
const COLOR_PRESETS = ['#ef4444', '#ffffff', '#000000', '#6366f1', '#38bdf8', '#8b5cf6', '#f59e0b'];

const DRAW_TOOLS: { id: Tool; icon: typeof Pen; label: string }[] = [
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'fill', icon: PaintBucket, label: 'Fill' },
  { id: 'replace', icon: Palette, label: 'Replace color' },
  { id: 'eyedropper', icon: Pipette, label: 'Eyedropper' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: CircleIcon, label: 'Ellipse' },
  { id: 'soften', icon: Wand2, label: 'Edge soften' },
];

const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'color-dodge', label: 'Dodge' },
  { id: 'color-burn', label: 'Burn' },
];

const CROP_INPUT_CLASS =
  'w-full px-2 py-1 bg-surface border border-hairline rounded-control text-xs font-mono text-foreground focus:border-primary transition-colors';

const clampScale = (value: number) => Math.max(0.1, Math.min(value, 5));

/** Slider + label row, themed to match the sidebars (LeftSidebar fieldsets). */
function SliderRow({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <div className="flex justify-between items-center mb-2">
        <legend className="text-sm text-muted">{label}</legend>
        <span className="text-xs font-mono text-muted tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <div className="px-2 pt-1 pb-2">
        <Slider
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(v) => onChange(v as number)}
          styles={SLIDER_STYLES}
        />
      </div>
    </fieldset>
  );
}

export function FrameEditorModal({ frame, previousFrame, nextFrame, onClose, onSave, onBatchCrop, onSplitGrid }: FrameEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const blurredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [brushSize, setBrushSize] = useState<number>(10);
  const [brushHardness, setBrushHardness] = useState<number>(100);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [tolerance, setTolerance] = useState<number>(30); // Tolerance for fill/replace
  const [blendMode, setBlendMode] = useState<BlendMode>('source-over');
  const [color, setColor] = useState<string>('#c00000'); // Default to red
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [onionMode, setOnionMode] = useState<OnionMode>('none');
  const [onionOpacity, setOnionOpacity] = useState(35);
  const [shapeMode, setShapeMode] = useState<ShapeMode>('stroke');
  const [showMobileProperties, setShowMobileProperties] = useState(false);
  const [gridRows, setGridRows] = useState(3);
  const [gridCols, setGridCols] = useState(4);
  const [gridPadding, setGridPadding] = useState(0);

  // History state for Undo/Redo — each entry is a canvas snapshot dataURL.
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);

  // Canvas Viewport State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [shapeStartPos, setShapeStartPos] = useState<{ x: number; y: number } | null>(null);

  // Crop State
  const [crop, setCrop] = useState<Crop>();
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  const requestClose = useCallback(() => {
    if (!isDirty || window.confirm('Discard unsaved edits?')) {
      onClose();
    }
  }, [isDirty, onClose]);

  // Dialog: Escape to close + focus the active tool on open + simple Tab trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    railRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const onTrapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((n) => n.offsetParent !== null); // ignore nodes hidden by responsive rules
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Context-aware property panel: which controls each tool actually uses,
  // declared once so adding a tool means editing one record, not six arrays.
  const toolProps: Partial<Record<Tool, { color?: true; size?: true; hardness?: true; opacity?: true; tolerance?: true; blend?: true }>> = {
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
  // Grid preview geometry: derive it once per relevant change instead of every
  // render — the modal re-renders on each pointer-move / zoom tick while editing.
  const { normalizedGrid, gridFrameCount, gridCellRects, gridPreviewRects } = useMemo(() => {
    const normalized = normalizeGridSplitOptions({ rows: gridRows, cols: gridCols, padding: gridPadding });
    const showGridPreview = activeTool === 'grid' && canvasDimensions.width > 0 && canvasDimensions.height > 0;
    // The dashed cell outlines only render when padding > 0, so skip that pass then.
    return {
      normalizedGrid: normalized,
      gridFrameCount: normalized.rows * normalized.cols,
      gridCellRects: showGridPreview && normalized.padding > 0
        ? createGridRects(canvasDimensions.width, canvasDimensions.height, { ...normalized, padding: 0 })
        : [],
      gridPreviewRects: showGridPreview
        ? createGridRects(canvasDimensions.width, canvasDimensions.height, normalized)
        : [],
    };
  }, [activeTool, gridRows, gridCols, gridPadding, canvasDimensions.width, canvasDimensions.height]);

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
    setViewportScale(scale * factor, {
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  };

  // Draw a decoded image onto the main + preview canvases, sizing both to the
  // image. Shared by the initial load and undo/redo/restore so the draw logic
  // lives in one place.
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
  };

  // Decode a dataURL onto the canvas via the shared loader, which rejects
  // (rather than hanging) on a corrupt/revoked source. Swallow here so an
  // unloadable history entry just leaves the canvas as-is.
  const loadImageToCanvas = (dataUrl: string) => {
    loadImage(dataUrl).then(drawImageToCanvas).catch(() => {
      /* leave the canvas as-is on a corrupt/revoked source */
    });
  };

  const saveState = (dataUrl: string, dirty = true) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(dataUrl);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
    setIsDirty(dirty);
  };

  // Navigate history to a bounds-checked index. Undo / redo / restore are just
  // calls into this.
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
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRedo, handleUndo]);

  // Load image onto canvas on initial open
  useEffect(() => {
    if (!frame) return;
    let cancelled = false;
    setHistory([]);
    setHistoryIndex(-1);
    setIsDirty(false);
    setCrop(undefined);
    setPan({ x: 0, y: 0 });
    setActiveTool('pen');
    setOnionMode('none');
    setShowMobileProperties(false);
    loadImage(frame.dataUrl)
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
      .catch(() => {
        /* corrupt/revoked source — leave canvas blank */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, setViewportScale]);

  const handleApplyCrop = () => {
    if (!crop || !crop.width || !crop.height || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = displayCropToPixelRect(crop, scale, canvas.width, canvas.height);

    // Crop the live canvas to a fresh canvas, then shrink the canvas to it.
    const cropped = cropToCanvas(canvas, rect);
    if (!cropped) return;

    canvas.width = cropped.width;
    canvas.height = cropped.height;
    setCanvasDimensions({ width: cropped.width, height: cropped.height });
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(cropped, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    saveState(dataUrl, false);
    if (frame) {
      onSave(frame.id, dataUrl, {
        width: cropped.width,
        height: cropped.height,
        close: false,
        message: 'Crop applied',
      });
    }
    setCrop(undefined);
  };

  const setPixelCrop = (rect: PixelRect) => {
    if (!canvasDimensions.width || !canvasDimensions.height) return;
    const clamped = clampPixelRect(rect, canvasDimensions.width, canvasDimensions.height);
    setCrop({
      unit: 'px',
      x: clamped.x * scale,
      y: clamped.y * scale,
      width: clamped.width * scale,
      height: clamped.height * scale,
    });
  };

  const updateCropField = (field: keyof PixelRect, value: number) => {
    const base = cropPixelRect ?? {
      x: 0,
      y: 0,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
    };
    setPixelCrop({ ...base, [field]: Number.isFinite(value) ? value : base[field] });
  };

  const setFullCrop = () => {
    setPixelCrop({ x: 0, y: 0, width: canvasDimensions.width, height: canvasDimensions.height });
  };

  const centerCrop = () => {
    const base = cropPixelRect ?? {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(canvasDimensions.width / 2)),
      height: Math.max(1, Math.round(canvasDimensions.height / 2)),
    };
    setPixelCrop({
      ...base,
      x: Math.round((canvasDimensions.width - base.width) / 2),
      y: Math.round((canvasDimensions.height - base.height) / 2),
    });
  };

  const squareCrop = () => {
    const base = cropPixelRect ?? {
      x: 0,
      y: 0,
      width: canvasDimensions.width,
      height: canvasDimensions.height,
    };
    const size = Math.max(1, Math.min(base.width, base.height));
    setPixelCrop({
      x: Math.round(base.x + (base.width - size) / 2),
      y: Math.round(base.y + (base.height - size) / 2),
      width: size,
      height: size,
    });
  };

  // Pointer client coordinates for either a mouse or touch React event.
  const pointerClientPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } =>
    'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

  // Convert a pointer event to canvas-space coordinates.
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

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    // Middle click or Alt key for panning
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

    if (activeTool === 'fill') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const c = hexToColor(color);
      c.a = opacityToByte(brushOpacity);

      const newImgData = floodFill(imgData, Math.floor(pos.x), Math.floor(pos.y), c, tolerance);
      ctx.putImageData(newImgData, 0, 0);
      saveState(canvas.toDataURL('image/png'));
      return;
    }

    if (activeTool === 'replace') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Read the clicked pixel straight from the buffer already in hand —
      // avoids a second getImageData round-trip per click.
      const idx = (Math.floor(pos.y) * imgData.width + Math.floor(pos.x)) * 4;
      const targetColor: Color = {
        r: imgData.data[idx],
        g: imgData.data[idx + 1],
        b: imgData.data[idx + 2],
        a: imgData.data[idx + 3],
      };
      const c = hexToColor(color);
      c.a = opacityToByte(brushOpacity);

      const newImgData = replaceColor(imgData, targetColor, c, tolerance);
      ctx.putImageData(newImgData, 0, 0);
      saveState(canvas.toDataURL('image/png'));
      return;
    }

    if (activeTool === 'eyedropper') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const idx = (Math.floor(pos.y) * imgData.width + Math.floor(pos.x)) * 4;
      setColor(colorToHex({
        r: imgData.data[idx],
        g: imgData.data[idx + 1],
        b: imgData.data[idx + 2],
        a: imgData.data[idx + 3],
      }));
      return;
    }

    setIsDrawing(true);
    setLastPos(pos);

    if (activeTool === 'rect' || activeTool === 'circle') {
      setShapeStartPos(pos);
    } else if (activeTool === 'soften') {
      // Generate blurred background
      const bCanvas = document.createElement('canvas');
      bCanvas.width = canvas.width;
      bCanvas.height = canvas.height;
      const bCtx = bCanvas.getContext('2d');
      if (bCtx) {
        // Use a blur radius proportional to brush size
        bCtx.filter = `blur(${Math.max(2, brushSize / 4)}px)`;
        bCtx.drawImage(canvas, 0, 0);
      }
      blurredCanvasRef.current = bCanvas;
      draw(pos, pos, false);
    } else {
      draw(pos, pos, false);
    }
  };

  const draw = (start: { x: number; y: number }, end: { x: number; y: number }, isShapePreview = false) => {
    const canvas = isShapePreview ? previewCanvasRef.current : canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (isShapePreview) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (activeTool === 'soften' && blurredCanvasRef.current) {
      // Scratch canvas masking technique for true blur
      const minX = Math.min(start.x, end.x) - brushSize;
      const minY = Math.min(start.y, end.y) - brushSize;
      const maxX = Math.max(start.x, end.x) + brushSize;
      const maxY = Math.max(start.y, end.y) + brushSize;
      const width = maxX - minX;
      const height = maxY - minY;

      const scratchCanvas = document.createElement('canvas');
      scratchCanvas.width = width;
      scratchCanvas.height = height;
      const sCtx = scratchCanvas.getContext('2d');
      if (sCtx) {
        sCtx.lineCap = 'round';
        sCtx.lineJoin = 'round';
        sCtx.lineWidth = brushSize;
        if (brushHardness < 100) {
          sCtx.shadowBlur = (100 - brushHardness) / 5;
          sCtx.shadowColor = 'black';
        }
        sCtx.strokeStyle = 'black';
        sCtx.beginPath();
        sCtx.moveTo(start.x - minX, start.y - minY);
        sCtx.lineTo(end.x - minX, end.y - minY);
        sCtx.stroke();

        sCtx.globalCompositeOperation = 'source-in';
        sCtx.drawImage(blurredCanvasRef.current, minX, minY, width, height, 0, 0, width, height);

        ctx.drawImage(scratchCanvas, minX, minY);
      }
      return;
    }

    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    // Hardness trick: use shadow blur for soft edges
    if (brushHardness < 100 && activeTool !== 'eraser') {
      ctx.shadowBlur = (100 - brushHardness) / 5;
      ctx.shadowColor = color;
    } else {
      ctx.shadowBlur = 0;
    }

    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = `rgba(0,0,0,${brushOpacity / 100})`;
    } else {
      ctx.globalCompositeOperation = blendMode;
      ctx.strokeStyle = hexWithAlpha(color, brushOpacity);
    }

    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  };

  const drawShape = (start: { x: number; y: number }, end: { x: number; y: number }, isPreview: boolean) => {
    const canvas = isPreview ? previewCanvasRef.current : canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (isPreview) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    ctx.beginPath();
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = hexWithAlpha(color, brushOpacity);
    ctx.fillStyle = hexWithAlpha(color, brushOpacity);

    if (activeTool === 'rect') {
      const width = end.x - start.x;
      const height = end.y - start.y;
      if (shapeMode === 'fill' || shapeMode === 'both') ctx.fillRect(start.x, start.y, width, height);
      if (shapeMode === 'stroke' || shapeMode === 'both') ctx.strokeRect(start.x, start.y, width, height);
    } else if (activeTool === 'circle') {
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      const centerX = Math.min(end.x, start.x) + radiusX;
      const centerY = Math.min(end.y, start.y) + radiusY;
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
       draw(lastPos, pos, false);
       setLastPos(pos);
    } else if (activeTool === 'rect' || activeTool === 'circle') {
       if (shapeStartPos) {
         drawShape(shapeStartPos, pos, true);
       }
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    const pos = getCanvasPos(e);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx && shapeStartPos && (activeTool === 'rect' || activeTool === 'circle')) {
      // Clear preview canvas first
      if (previewCanvasRef.current) {
        const pCtx = previewCanvasRef.current.getContext('2d');
        pCtx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
      }
      // Draw shape to main canvas
      drawShape(shapeStartPos, pos, false);
      setShapeStartPos(null);
    }

    if (canvas && (activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'rect' || activeTool === 'circle' || activeTool === 'soften')) {
       saveState(canvas.toDataURL('image/png'));
    }

    if (activeTool === 'soften') {
      blurredCanvasRef.current = null; // Clean up memory
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomFromClientPoint(e.clientX, e.clientY, zoomFactor);
    }
  };

  const handleSave = () => {
    if (!frame || !canvasRef.current) return;
    setIsDirty(false);
    onSave(frame.id, canvasRef.current.toDataURL('image/png'), {
      width: canvasRef.current.width,
      height: canvasRef.current.height,
    });
  };

  const handleSplitGrid = () => {
    if (!frame || !canvasRef.current || !onSplitGrid) return;
    const splitFrames = splitCanvasIntoGridFrames(canvasRef.current, {
      rows: gridRows,
      cols: gridCols,
      padding: gridPadding,
    }, {
      startTime: frame.time,
      timeStep: 0.1,
    });
    setIsDirty(false);
    onSplitGrid(frame.id, splitFrames);
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setViewportScale(1);
  };

  const toolButtonClass = (active: boolean) =>
    `group relative grid place-items-center w-11 h-11 rounded-control transition-colors ${
      active
        ? 'bg-primary text-white shadow-[0_0_16px_var(--accent-glow)]'
        : 'text-muted hover:text-foreground hover:bg-white/5'
    }`;

  const HIST_BTN =
    'flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-control text-xs font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted';

  const cursorFor = (): string => {
    if (isPanning) return 'grab';
    if (activeTool === 'grid') return 'default';
    if (activeTool === 'fill' || activeTool === 'replace' || activeTool === 'eyedropper') return 'pointer';
    return 'crosshair';
  };

  const gridSplitContent = onSplitGrid ? (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">Grid split</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted/70">Rows</span>
          <input
            type="number"
            min={1}
            max={20}
            value={gridRows}
            onChange={(e) => setGridRows(finiteOr(e.currentTarget.valueAsNumber, 1))}
            className={CROP_INPUT_CLASS}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted/70">Cols</span>
          <input
            type="number"
            min={1}
            max={20}
            value={gridCols}
            onChange={(e) => setGridCols(finiteOr(e.currentTarget.valueAsNumber, 1))}
            className={CROP_INPUT_CLASS}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted/70">Pad</span>
          <input
            type="number"
            min={0}
            max={200}
            value={gridPadding}
            onChange={(e) => setGridPadding(finiteOr(e.currentTarget.valueAsNumber, 0))}
            className={CROP_INPUT_CLASS}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={handleSplitGrid}
        className="w-full min-h-[40px] rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-[0_0_16px_var(--accent-glow)]"
      >
        <Grid3X3 className="w-4 h-4" aria-hidden="true" /> Split into {gridFrameCount} frames
      </button>
      <p className="text-xs text-muted leading-relaxed">
        Replaces this frame with grid cells from the current canvas.
      </p>
    </div>
  ) : null;

  const propertiesContent = (
    <div className="space-y-5">
      {showColor && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 relative">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 shrink-0">Color</span>
            <button
              type="button"
              aria-label="Open color picker"
              aria-haspopup="true"
              aria-expanded={showColorPicker}
              onClick={() => setShowColorPicker((v) => !v)}
              className="w-8 h-8 rounded-control border border-hairline-strong shadow-inner"
              style={{ backgroundColor: color }}
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Hex color"
              className="w-24 px-2 py-1 bg-surface border border-hairline rounded-control text-sm font-mono text-foreground focus:border-primary transition-colors"
            />

            {showColorPicker && (
              <div className="absolute top-full left-0 z-50 mt-2">
                <div className="fixed inset-0" onClick={() => setShowColorPicker(false)} aria-hidden="true" />
                <div className="relative glass-panel rounded-control p-3 shadow-pop">
                  <HexColorPicker color={color} onChange={setColor} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Select color ${c}`}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                  color.toLowerCase() === c ? 'border-primary ring-2 ring-primary' : 'border-hairline-strong'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      {showSize && (
        <SliderRow label="Brush size" value={brushSize} suffix="px" min={1} max={100} step={1} onChange={setBrushSize} />
      )}

      {showHardness && (
        <SliderRow label="Hardness" value={brushHardness} suffix="%" min={0} max={100} step={1} onChange={setBrushHardness} />
      )}

      {showOpacity && (
        <SliderRow label="Opacity" value={brushOpacity} suffix="%" min={0} max={100} step={1} onChange={setBrushOpacity} />
      )}

      {(activeTool === 'rect' || activeTool === 'circle') && (
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">Shape</legend>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'stroke' as const, label: 'Stroke' },
              { id: 'fill' as const, label: 'Fill' },
              { id: 'both' as const, label: 'Both' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setShapeMode(item.id)}
                aria-pressed={shapeMode === item.id}
                className={`min-h-[32px] rounded-control text-xs font-medium transition-colors ${
                  shapeMode === item.id
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {showTolerance && (
        <SliderRow label="Tolerance" value={tolerance} min={0} max={255} step={1} onChange={setTolerance} />
      )}

      {showBlend && (
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">Blend mode</legend>
          <div className="grid grid-cols-2 gap-1">
            {BLEND_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setBlendMode(m.id)}
                aria-pressed={blendMode === m.id}
                className={`min-h-[32px] rounded-control text-xs font-medium transition-colors ${
                  blendMode === m.id
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-muted hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {activeTool === 'crop' && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">Crop</p>
          <div className="grid grid-cols-3 gap-1">
            <button type="button" onClick={setFullCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors">
              Full
            </button>
            <button type="button" onClick={centerCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors">
              Center
            </button>
            <button type="button" onClick={squareCrop} className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors">
              1:1
            </button>
          </div>
          {cropPixelRect && (
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'width', 'height'] as const).map((field) => (
                <label key={field} className="space-y-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    {field === 'width' ? 'W' : field === 'height' ? 'H' : field.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min={field === 'x' || field === 'y' ? 0 : 1}
                    max={field === 'x' || field === 'width' ? canvasDimensions.width : canvasDimensions.height}
                    value={cropPixelRect[field]}
                    onChange={(e) => updateCropField(field, e.currentTarget.valueAsNumber)}
                    className={CROP_INPUT_CLASS}
                  />
                </label>
              ))}
            </div>
          )}
          {hasCropSelection ? (
            <>
              <button
                type="button"
                onClick={handleApplyCrop}
                className="w-full min-h-[40px] rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-[0_0_16px_var(--accent-glow)]"
              >
                <CheckIcon className="w-4 h-4" aria-hidden="true" /> Apply crop
              </button>
              {onBatchCrop && (
                <button
                  type="button"
                  onClick={() => {
                    if (!canvasRef.current) return;
                    onBatchCrop(displayCropToPixelRect(crop!, scale, canvasRef.current.width, canvasRef.current.height));
                  }}
                  className="w-full min-h-[40px] rounded-control border border-hairline text-matte hover:bg-matte/10 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Layers className="w-4 h-4" aria-hidden="true" /> Apply to selected frames
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-muted leading-relaxed">
              Drag on the canvas to select a crop region.
            </p>
          )}
        </div>
      )}

      {activeTool === 'grid' && gridSplitContent}

      {(previousFrame || nextFrame) && (
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">Onion skin</legend>
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'none' as const, label: 'Off', disabled: false },
              { id: 'previous' as const, label: 'Prev', disabled: !previousFrame },
              { id: 'next' as const, label: 'Next', disabled: !nextFrame },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => setOnionMode(item.id)}
                aria-pressed={onionMode === item.id}
                className={`min-h-[32px] rounded-control text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  onionMode === item.id
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {onionMode !== 'none' && (
            <SliderRow label="Overlay opacity" value={onionOpacity} suffix="%" min={5} max={80} step={1} onChange={setOnionOpacity} />
          )}
        </fieldset>
      )}
    </div>
  );

  if (!frame) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-frame-title"
        onKeyDown={onTrapTab}
        className="glass-panel rounded-card w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
          <h2 id="edit-frame-title" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid place-items-center w-7 h-7 rounded-control bg-gradient-to-br from-primary to-dedupe shadow-[0_0_16px_var(--accent-glow)]">
              <Pen className="w-4 h-4 text-white" aria-hidden="true" />
            </span>
            Edit frame
            <span className="font-mono text-xs text-muted">
              #{frame.id.split('-').pop()?.substring(0, 4)}
            </span>
          </h2>

          <div className="flex items-center gap-1">
            <button type="button" onClick={handleUndo} disabled={historyIndex <= 0} className={HIST_BTN} title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Undo</span>
            </button>
            <button type="button" onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={HIST_BTN} title="Redo (Ctrl+Y)">
              <Redo2 className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Redo</span>
            </button>
            <button
              type="button"
              onClick={handleRestore}
              disabled={historyIndex <= 0}
              className="flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-control text-xs font-medium text-primary border border-hairline hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title="Restore original"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">Restore</span>
            </button>
            <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close editor"
              className="grid place-items-center w-9 h-9 rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Body: tool rail + canvas + properties */}
        <div className="flex-1 min-h-0 flex">
          {/* Tool rail */}
          <nav
            ref={railRef}
            aria-label="Editing tools"
            className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-hairline bg-surface/30"
          >
            {DRAW_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                aria-pressed={activeTool === t.id}
                aria-label={t.label}
                title={t.label}
                className={toolButtonClass(activeTool === t.id)}
              >
                <t.icon className="w-5 h-5" aria-hidden="true" />
              </button>
            ))}
            <span className="my-1 h-px w-7 bg-hairline" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setActiveTool('crop')}
              aria-pressed={activeTool === 'crop'}
              aria-label="Crop"
              title="Crop"
              className={toolButtonClass(activeTool === 'crop')}
            >
              <CropIcon className="w-5 h-5" aria-hidden="true" />
            </button>
            {onSplitGrid && (
              <button
                type="button"
                onClick={() => setActiveTool('grid')}
                aria-pressed={activeTool === 'grid'}
                aria-label="Grid split"
                title="Grid split"
                className={toolButtonClass(activeTool === 'grid')}
              >
                <Grid3X3 className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </nav>

          {/* Canvas */}
          <div
            ref={containerRef}
            className="frame-checker flex-1 relative overflow-hidden flex items-center justify-center select-none"
            onWheel={handleWheel}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: '0 0',
                cursor: cursorFor(),
                position: 'relative',
                width: canvasDimensions.width * scale,
                height: canvasDimensions.height * scale,
              }}
            >
              <canvas
                ref={canvasRef}
                className="bg-transparent"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ touchAction: 'none', width: '100%', height: '100%' }}
              />
              <canvas
                ref={previewCanvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ width: '100%', height: '100%' }}
              />
              {onionFrame && (
                <img
                  src={onionFrame.dataUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    opacity: onionOpacity / 100,
                    mixBlendMode: 'difference',
                  }}
                />
              )}

              {activeTool === 'grid' && gridPreviewRects.length > 0 && (
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none z-20"
                  viewBox={`0 0 ${canvasDimensions.width} ${canvasDimensions.height}`}
                  preserveAspectRatio="none"
                >
                  <rect
                    x={0}
                    y={0}
                    width={canvasDimensions.width}
                    height={canvasDimensions.height}
                    fill="rgba(10, 11, 18, 0.16)"
                  />
                  {normalizedGrid.padding > 0 && gridCellRects.map((rect, i) => (
                    <rect
                      key={`cell-${rect.x}-${rect.y}-${i}`}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.42)"
                      strokeDasharray="6 5"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {gridPreviewRects.map((rect, i) => (
                    <g key={`${rect.x}-${rect.y}-${i}`}>
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill="rgba(99, 102, 241, 0.08)"
                        stroke="rgba(129, 140, 248, 0.95)"
                        strokeWidth={Math.max(1, 2 / scale)}
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={rect.x + Math.max(2, 4 / scale)}
                        y={rect.y + Math.max(2, 4 / scale)}
                        width={Math.max(18, 26 / scale)}
                        height={Math.max(14, 20 / scale)}
                        rx={Math.max(2, 4 / scale)}
                        fill="rgba(10, 11, 18, 0.78)"
                        stroke="rgba(255, 255, 255, 0.24)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={rect.x + Math.max(11, 17 / scale)}
                        y={rect.y + Math.max(12, 18 / scale)}
                        fill="white"
                        fontSize={Math.max(9, 12 / scale)}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </text>
                    </g>
                  ))}
                </svg>
              )}

              {/* Crop Overlay */}
              {activeTool === 'crop' && canvasDimensions.width > 0 && (
                <div className="absolute inset-0 z-10">
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Invisible div to give ReactCrop dimensions to work with */}
                    <div style={{ width: canvasDimensions.width * scale, height: canvasDimensions.height * scale, opacity: 0 }} />
                  </ReactCrop>
                </div>
              )}
            </div>

            {/* Hints */}
            <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 max-w-[60%]">
              <span className="text-[11px] text-muted bg-background/80 px-2.5 py-1 rounded-pill backdrop-blur-sm shadow-sm">
                Alt + Scroll: zoom
              </span>
              <span className="text-[11px] text-muted bg-background/80 px-2.5 py-1 rounded-pill backdrop-blur-sm shadow-sm">
                Alt / Middle-drag: pan
              </span>
            </div>

            {/* Zoom widget */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 p-1 rounded-control backdrop-blur-sm shadow-sm border border-hairline">
              <button
                type="button"
                onClick={() => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  zoomFromClientPoint(rect ? rect.left + rect.width / 2 : 0, rect ? rect.top + rect.height / 2 : 0, 0.9);
                }}
                aria-label="Zoom out"
                className="grid place-items-center w-8 h-8 rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <ZoomOut className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-xs font-mono px-1 tabular-nums min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  zoomFromClientPoint(rect ? rect.left + rect.width / 2 : 0, rect ? rect.top + rect.height / 2 : 0, 1.1);
                }}
                aria-label="Zoom in"
                className="grid place-items-center w-8 h-8 rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <ZoomIn className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={fitToView} aria-label="Fit canvas to view" className="px-2 h-8 rounded-control text-xs font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors">
                Fit
              </button>
              <button type="button" onClick={resetView} aria-label="Reset zoom to 100%" className="px-2 h-8 rounded-control text-xs font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors">
                1:1
              </button>
            </div>
          </div>

          {/* Properties panel (context-aware) */}
          <aside
            aria-label="Tool properties"
            className="hidden sm:flex flex-col w-56 md:w-60 shrink-0 border-l border-hairline bg-surface/30 p-4 overflow-y-auto custom-scrollbar"
          >
            <h3 className="text-sm font-semibold mb-4">Properties</h3>

            <div className="space-y-5">
              {/* Color */}
              {showColor && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 relative">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 shrink-0">Color</span>
                    <button
                      type="button"
                      aria-label="Open color picker"
                      aria-haspopup="true"
                      aria-expanded={showColorPicker}
                      onClick={() => setShowColorPicker((v) => !v)}
                      className="w-8 h-8 rounded-control border border-hairline-strong shadow-inner"
                      style={{ backgroundColor: color }}
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      aria-label="Hex color"
                      className="w-24 px-2 py-1 bg-surface border border-hairline rounded-control text-sm font-mono text-foreground focus:border-primary transition-colors"
                    />

                    {showColorPicker && (
                      <div className="absolute top-full left-0 z-50 mt-2">
                        <div className="fixed inset-0" onClick={() => setShowColorPicker(false)} aria-hidden="true" />
                        <div className="relative glass-panel rounded-control p-3 shadow-pop">
                          <HexColorPicker color={color} onChange={setColor} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Select color ${c}`}
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                          color.toLowerCase() === c ? 'border-primary ring-2 ring-primary' : 'border-hairline-strong'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Brush size */}
              {showSize && (
                <SliderRow label="Brush size" value={brushSize} suffix="px" min={1} max={100} step={1} onChange={setBrushSize} />
              )}

              {/* Hardness */}
              {showHardness && (
                <SliderRow label="Hardness" value={brushHardness} suffix="%" min={0} max={100} step={1} onChange={setBrushHardness} />
              )}

              {/* Opacity */}
              {showOpacity && (
                <SliderRow label="Opacity" value={brushOpacity} suffix="%" min={0} max={100} step={1} onChange={setBrushOpacity} />
              )}

              {(activeTool === 'rect' || activeTool === 'circle') && (
                <fieldset>
                  <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">Shape</legend>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'stroke' as const, label: 'Stroke' },
                      { id: 'fill' as const, label: 'Fill' },
                      { id: 'both' as const, label: 'Both' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setShapeMode(item.id)}
                        aria-pressed={shapeMode === item.id}
                        className={`min-h-[32px] rounded-control text-xs font-medium transition-colors ${
                          shapeMode === item.id
                            ? 'bg-primary text-white'
                            : 'bg-surface-hover text-muted hover:text-foreground'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* Tolerance */}
              {showTolerance && (
                <SliderRow label="Tolerance" value={tolerance} min={0} max={255} step={1} onChange={setTolerance} />
              )}

              {/* Blend mode */}
              {showBlend && (
                <fieldset>
                  <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">Blend mode</legend>
                  <div className="grid grid-cols-2 gap-1">
                    {BLEND_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setBlendMode(m.id)}
                        aria-pressed={blendMode === m.id}
                        className={`min-h-[32px] rounded-control text-xs font-medium transition-colors ${
                          blendMode === m.id
                            ? 'bg-primary text-white'
                            : 'bg-surface-hover text-muted hover:text-foreground'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* Crop actions */}
              {activeTool === 'crop' && (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">Crop</p>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={setFullCrop}
                      className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors"
                    >
                      Full
                    </button>
                    <button
                      type="button"
                      onClick={centerCrop}
                      className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={squareCrop}
                      className="min-h-[32px] rounded-control bg-surface-hover text-xs font-medium text-muted hover:text-foreground transition-colors"
                    >
                      1:1
                    </button>
                  </div>
                  {cropPixelRect && (
                    <div className="grid grid-cols-2 gap-2">
                      {(['x', 'y', 'width', 'height'] as const).map((field) => (
                        <label key={field} className="space-y-1">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                            {field === 'width' ? 'W' : field === 'height' ? 'H' : field.toUpperCase()}
                          </span>
                          <input
                            type="number"
                            min={field === 'x' || field === 'y' ? 0 : 1}
                            max={field === 'x' || field === 'width' ? canvasDimensions.width : canvasDimensions.height}
                            value={cropPixelRect[field]}
                            onChange={(e) => updateCropField(field, e.currentTarget.valueAsNumber)}
                            className={CROP_INPUT_CLASS}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {hasCropSelection ? (
                    <>
                      <button
                        type="button"
                        onClick={handleApplyCrop}
                        className="w-full min-h-[40px] rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-[0_0_16px_var(--accent-glow)]"
                      >
                        <CheckIcon className="w-4 h-4" aria-hidden="true" /> Apply crop
                      </button>
                      {onBatchCrop && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!canvasRef.current) return;
                            onBatchCrop(displayCropToPixelRect(crop!, scale, canvasRef.current.width, canvasRef.current.height));
                          }}
                          className="w-full min-h-[40px] rounded-control border border-hairline text-matte hover:bg-matte/10 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Layers className="w-4 h-4" aria-hidden="true" /> Apply to selected frames
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted leading-relaxed">
                      Drag on the canvas to select a crop region.
                    </p>
                  )}
                </div>
              )}

              {activeTool === 'grid' && gridSplitContent}

              {(previousFrame || nextFrame) && (
                <fieldset className="space-y-3">
                  <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">Onion skin</legend>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'none' as const, label: 'Off', disabled: false },
                      { id: 'previous' as const, label: 'Prev', disabled: !previousFrame },
                      { id: 'next' as const, label: 'Next', disabled: !nextFrame },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => setOnionMode(item.id)}
                        aria-pressed={onionMode === item.id}
                        className={`min-h-[32px] rounded-control text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          onionMode === item.id
                            ? 'bg-primary text-white'
                            : 'bg-surface-hover text-muted hover:text-foreground'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {onionMode !== 'none' && (
                    <SliderRow label="Overlay opacity" value={onionOpacity} suffix="%" min={5} max={80} step={1} onChange={setOnionOpacity} />
                  )}
                </fieldset>
              )}
            </div>
          </aside>
        </div>

        {showMobileProperties && (
          <div className="sm:hidden border-t border-hairline bg-surface/95 backdrop-blur-md max-h-[46vh] overflow-y-auto custom-scrollbar p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold">Properties</h3>
              <button
                type="button"
                onClick={() => setShowMobileProperties(false)}
                aria-label="Close properties"
                className="grid place-items-center w-8 h-8 rounded-control text-muted hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {propertiesContent}
          </div>
        )}

        {/* Action bar */}
        <footer className="flex items-center justify-between sm:justify-end gap-3 px-4 py-3 border-t border-hairline">
          <button
            type="button"
            onClick={() => setShowMobileProperties((v) => !v)}
            aria-expanded={showMobileProperties}
            className="sm:hidden min-h-[40px] px-3 rounded-control border border-hairline text-sm font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> Properties
          </button>
          <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={requestClose}
            className="min-h-[40px] px-4 rounded-control border border-hairline text-sm font-medium text-muted hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[40px] px-4 rounded-control bg-primary hover:bg-primary-hover text-white text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-[0_0_20px_var(--accent-glow)]"
          >
            <Save className="w-4 h-4" aria-hidden="true" /> Save &amp; close
          </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
