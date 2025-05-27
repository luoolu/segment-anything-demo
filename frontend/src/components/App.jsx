// frontend/src/components/App.jsx

import React, { useState, useRef, useEffect } from "react";
import ToolBar from "./ToolBar";

// 样式常量
const OUTLINE_COLOR = "rgb(0, 0, 255)";
const OUTLINE_WIDTH = 3;

const HOVER_COLOR = "rgba(0, 255, 255, 0.95)"; // 悬停发光颜色 (更亮更实的青色)
const HOVER_SHADOW_BLUR = 25;                 // 悬停发光模糊半径 (调大以增强效果)
const HOVER_LINE_WIDTH = 6;                   // 悬停时实际描边的线宽 (可以略粗)
// HOVER_FILL_OPACITY_ACTIVE 不再需要，因为填充将透明
const HOVER_DOT_COLOR = "rgba(0, 255, 255, 1)";
const HOVER_DOT_RADIUS = 6;

const SELECT_GLOW_COLOR = "rgba(0, 255, 255, 0.8)";
const SELECT_GLOW_BLUR = 20;
const SELECT_DOT_COLOR = "rgba(0, 255, 255, 1)";
const SELECT_DOT_RADIUS = 6;
const SELECTED_MASK_FILL_OPACITY = 0.0;

const DRAWING_BOX_COLOR = "rgba(0, 255, 0, 0.7)";
const DRAWING_BOX_LINE_WIDTH = 2;

const MASK_FILL_OPACITY = 0.0;
const DIMMED_MASK_FILL_OPACITY = 0.1;

const DIM_BACKGROUND_COLOR = "rgba(0,0,0,0.6)";
const DEFAULT_MASK_COLOR = [128, 128, 128];


// 将 hex 字符串转为 Uint8Array
function hexToBytes(hex) {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function drawSmoothPolygon(ctx, points) {
  const len = points.length;
  if (len < 3) {
    ctx.beginPath();
    points.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    );
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const [x0, y0] = points[(i - 1 + len) % len];
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % len];
    const midX0 = (x0 + x1) / 2;
    const midY0 = (y0 + y1) / 2;
    const midX1 = (x1 + x2) / 2;
    const midY1 = (y1 + y2) / 2;
    if (i === 0) ctx.moveTo(midX0, midY0);
    ctx.quadraticCurveTo(x1, y1, midX1, midY1);
  }
  ctx.closePath();
}

function buildSmoothPath(points) {
  const p = new Path2D();
  const len = points.length;
  if (len < 3) {
    points.forEach(([x, y], i) =>
      i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)
    );
    p.closePath();
    return p;
  }
  for (let i = 0; i < len; i++) {
    const [x0, y0] = points[(i - 1 + len) % len];
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % len];
    const midX0 = (x0 + x1) / 2;
    const midY0 = (y0 + y1) / 2;
    const midX1 = (x1 + x2) / 2;
    const midY1 = (y1 + y2) / 2;
    if (i === 0) p.moveTo(midX0, midY0);
    p.quadraticCurveTo(x1, y1, midX1, midY1);
  }
  p.closePath();
  return p;
}


export default function App() {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [masks, setMasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredMaskId, setHoveredMaskId] = useState(null);
  const [selectedMaskId, setSelectedMaskId] = useState(null);
  const [currentTool, setCurrentTool] = useState("everything");

  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [boxStartPoint, setBoxStartPoint] = useState(null);
  const [boxEndPoint, setBoxEndPoint] = useState(null);

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const pathsRef = useRef([]);

  const handleUploadImage = (file) => {
    // console.log("[handleUploadImage] Started. File:", file?.name);
    if (imageUrl) { URL.revokeObjectURL(imageUrl); }
    setImageUrl(null); setImageFile(null); setImageLoaded(false); imageRef.current = null;
    setMasks([]); setHoveredMaskId(null); setSelectedMaskId(null);

    const newImageUrl = URL.createObjectURL(file);
    setImageFile(file);

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      if (canvasRef.current) {
        canvasRef.current.width = img.naturalWidth;
        canvasRef.current.height = img.naturalHeight;
      }
      setImageLoaded(true);
    };
    img.onerror = (e) => {
      console.error("[img.onerror] Image failed to load.", e);
      URL.revokeObjectURL(newImageUrl);
      setImageUrl(null); setImageFile(null); setImageLoaded(false); imageRef.current = null;
      alert("图片加载失败！请检查文件格式或控制台错误。");
    };
    img.src = newImageUrl;
    setImageUrl(newImageUrl);
  };

  const handleToolChange = (tool) => {
    setCurrentTool(tool); setSelectedMaskId(null); setHoveredMaskId(null);
    if (tool !== 'box') { setIsDrawingBox(false); setBoxStartPoint(null); setBoxEndPoint(null); }
  };

  const handleSegmentEverything = async () => {
    if (!imageFile) return;
    setLoading(true);
    try {
      const form = new FormData(); form.append("file", imageFile);
      const res = await fetch("http://localhost:8001/segmentEverything", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { masks: dataMasks } = await res.json();
      const parsed = dataMasks.map((m, i) => ({ ...m, id: m.id ?? i, url: URL.createObjectURL(new Blob([hexToBytes(m.segmentation)],{type:"image/png"})) }));
      setMasks(parsed);
    } catch (err) { console.error("Segmentation error:", err); alert("分割出错：" + err.message); }
    finally { setLoading(false); }
  };

  const handleSegmentBox = async (boxCoords) => {
    if (!imageFile || !boxCoords) return;
    setLoading(true);
    try {
      const form = new FormData(); form.append("file", imageFile); form.append("box", JSON.stringify(boxCoords));
      const res = await fetch("http://localhost:8001/segmentBox", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { mask } = await res.json();
      setMasks(prev => [...prev, { ...mask, id: mask.id ?? `box-${prev.length}`, url: URL.createObjectURL(new Blob([hexToBytes(mask.segmentation)],{type:"image/png"})) }]);
    } catch (err) { console.error("Box segmentation error:", err); alert("Box 分割出错：" + err.message); }
    finally { setLoading(false); }
  };

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleCanvasMouseDown = (e) => {
    if (currentTool !== "box" || !imageLoaded) return;
    const coords = getCanvasCoordinates(e);
    if (coords) { setIsDrawingBox(true); setBoxStartPoint(coords); setBoxEndPoint(coords); setSelectedMaskId(null); setHoveredMaskId(null); }
  };

  const handleCanvasMouseMove = (e) => {
    const coords = getCanvasCoordinates(e); if (!coords || !imageLoaded) return;
    if (isDrawingBox && currentTool === "box" && boxStartPoint) {
      setBoxEndPoint(coords);
    } else if (currentTool !== "box" && masks.length > 0 && pathsRef.current.length > 0) {
      const ctx = canvasRef.current.getContext("2d"); let found = null;
      for (let i = pathsRef.current.length - 1; i >= 0; i--) {
        const { id, path } = pathsRef.current[i];
        if (path && ctx.isPointInPath(path, coords.x, coords.y)) { found = id; break; }
      }
      setHoveredMaskId(found);
    } else if (currentTool !== "box" && hoveredMaskId !== null) { setHoveredMaskId(null); }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawingBox && currentTool === "box" && boxStartPoint && boxEndPoint) {
      setIsDrawingBox(false);
      const x1 = Math.min(boxStartPoint.x, boxEndPoint.x), y1 = Math.min(boxStartPoint.y, boxEndPoint.y);
      const x2 = Math.max(boxStartPoint.x, boxEndPoint.x), y2 = Math.max(boxStartPoint.y, boxEndPoint.y);
      if (x2 - x1 > 5 && y2 - y1 > 5) { handleSegmentBox([x1, y1, x2, y2]); }
      setBoxStartPoint(null); setBoxEndPoint(null);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    const hasLoadedImage = imageUrl && imageLoaded && imageRef.current;
    if (!hasLoadedImage) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

    const img = imageRef.current;
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (pathsRef.current.length !== masks.length || masks.some((m, i) => pathsRef.current[i]?.id !== m.id)) {
      pathsRef.current = masks.map(m => ({
          id: m.id,
          path: m.polygon ? buildSmoothPath(m.polygon) : null,
          polygon: m.polygon,
          color: m.color
      }));
    }

    const somethingIsActive = hoveredMaskId != null || selectedMaskId != null;

    if (somethingIsActive) {
      ctx.save();
      ctx.fillStyle = DIM_BACKGROUND_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    masks.forEach((m) => {
      const pathData = pathsRef.current.find(p => p.id === m.id);
      if (!pathData || !pathData.path) return;

      const currentPath = pathData.path;
      const [r, g, b] = pathData.color || DEFAULT_MASK_COLOR;
      const isSelected = m.id === selectedMaskId;
      const isHovered = m.id === hoveredMaskId && !isSelected;

      if (isSelected) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${SELECTED_MASK_FILL_OPACITY})`;
        ctx.fill(currentPath);
        ctx.save();
        ctx.strokeStyle = SELECT_GLOW_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH; // 使用统一的 OUTLINE_WIDTH 或特定的 SELECT_LINE_WIDTH
        ctx.shadowBlur = SELECT_GLOW_BLUR;
        ctx.shadowColor = SELECT_GLOW_COLOR;
        ctx.lineJoin = "round"; // 为发光轮廓也设置平滑连接
        ctx.lineCap = "round";
        ctx.stroke(currentPath);
        ctx.restore();
        const pts = pathData.polygon;
        if (pts && pts.length > 0) {
          const cx = pts.reduce((s, [x_coord]) => s + x_coord, 0) / pts.length;
          const cy = pts.reduce((s, [, y_coord]) => s + y_coord, 0) / pts.length;
          ctx.save(); ctx.fillStyle = SELECT_DOT_COLOR; ctx.beginPath();
          ctx.arc(cx, cy, SELECT_DOT_RADIUS, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
        }
      } else if (isHovered) {
        // 悬停的掩码: 内部完全透明，轮廓发光
        // 不进行 ctx.fill(currentPath) 操作，实现内部透明

        ctx.save();
        ctx.shadowColor = HOVER_COLOR;
        ctx.shadowBlur = HOVER_SHADOW_BLUR; // 使用新的、更大的模糊半径
        ctx.shadowOffsetX = 0; // 确保阴影在各个方向均匀
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = HOVER_COLOR;
        ctx.lineWidth = HOVER_LINE_WIDTH;   // 使用新的、可能更粗的线宽
        ctx.lineJoin = "round"; // 使发光轮廓的连接处更平滑
        ctx.lineCap = "round";  // 使发光轮廓的末端更平滑
        ctx.stroke(currentPath);
        ctx.restore();

        const pts = pathData.polygon;
        if (pts && pts.length > 0) {
            const cx = pts.reduce((s, [x_coord]) => s + x_coord, 0) / pts.length;
            const cy = pts.reduce((s, [, y_coord]) => s + y_coord, 0) / pts.length;
            ctx.save(); ctx.fillStyle = HOVER_DOT_COLOR; ctx.beginPath();
            ctx.arc(cx, cy, HOVER_DOT_RADIUS, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
        }
      } else {
        if (somethingIsActive) {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${DIMMED_MASK_FILL_OPACITY})`;
          ctx.fill(currentPath);
          // 当有其他对象激活时，不绘制这些普通对象的轮廓线
        } else {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${MASK_FILL_OPACITY})`;
          ctx.fill(currentPath);
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = OUTLINE_WIDTH;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke(currentPath);
        }
      }
    });

    if (isDrawingBox && currentTool === "box" && boxStartPoint && boxEndPoint) {
      ctx.strokeStyle = DRAWING_BOX_COLOR;
      ctx.lineWidth = DRAWING_BOX_LINE_WIDTH;
      ctx.setLineDash([5, 3]);
      const rectX = Math.min(boxStartPoint.x, boxEndPoint.x);
      const rectY = Math.min(boxStartPoint.y, boxEndPoint.y);
      const rectWidth = Math.abs(boxStartPoint.x - boxEndPoint.x);
      const rectHeight = Math.abs(boxStartPoint.y - boxEndPoint.y);
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
      ctx.setLineDash([]);
    }
  }, [imageUrl, masks, hoveredMaskId, selectedMaskId, isDrawingBox, boxStartPoint, boxEndPoint, imageLoaded, currentTool]);

  const handleCanvasClick = () => {
    if (!isDrawingBox && currentTool !== "box" && hoveredMaskId != null) {
      setSelectedMaskId( hoveredMaskId === selectedMaskId ? null : hoveredMaskId );
    }
  };

  const handleCutout = () => {
    if (selectedMaskId == null || !imageLoaded) { alert("请选择一个掩码进行抠图 (并确保图片已加载)."); return; }
    const selectedMaskData = masks.find(m => m.id === selectedMaskId);
    if (!selectedMaskData || !imageRef.current || !canvasRef.current) { return; }

    setLoading(true);
    setTimeout(() => {
      try {
        const tempCanvas = document.createElement('canvas'); const tempCtx = tempCanvas.getContext('2d');
        const originalImage = imageRef.current;
        tempCanvas.width = originalImage.naturalWidth; tempCanvas.height = originalImage.naturalHeight;

        const pathData = pathsRef.current.find(p => p.id === selectedMaskId);
        if (pathData?.path) { tempCtx.clip(pathData.path); }
        else if (selectedMaskData.polygon) { drawSmoothPolygon(tempCtx, selectedMaskData.polygon); tempCtx.clip(); }
        else { throw new Error("No polygon data for cutout clipping");}

        tempCtx.drawImage(originalImage, 0, 0, tempCanvas.width, tempCanvas.height);
        const cutoutDataUrl = tempCanvas.toDataURL('image/png');
        const newWindow = window.open();
        if (newWindow) newWindow.document.write(`<img src="${cutoutDataUrl}" alt="Cutout Mask" style="max-width:100%;max-height:100%;"/>`);
        else alert("无法打开新窗口。请检查弹出窗口拦截设置。");
      } catch (error) { console.error("Error during cutout:", error); alert("抠图时发生错误: " + error.message); }
      finally { setLoading(false); }
    }, 50);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-800">
      <ToolBar
        onUploadImage={handleUploadImage} onToolChange={handleToolChange}
        onSegmentEverything={handleSegmentEverything} onCutout={handleCutout}
        currentTool={currentTool} hasImage={!!imageUrl && imageLoaded}
        hasMasks={masks.length > 0} hasSelection={selectedMaskId != null}
      />
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-auto">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        {imageUrl && imageLoaded ? (
          <canvas
            ref={canvasRef} className="max-w-full max-h-full border border-gray-600"
            onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp} onClick={handleCanvasClick}
            onMouseLeave={() => { if (isDrawingBox) handleCanvasMouseUp(); setHoveredMaskId(null); }}
          />
        ) : imageUrl && !imageLoaded && !loading ? (
           <span className="text-gray-400">图片加载中... (请查看控制台日志)</span>
        ) : !imageUrl && !loading ? (
          <span className="text-gray-400">请上传图片</span>
        ) : null}
      </div>
    </div>
  );
}