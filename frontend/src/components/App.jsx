// frontend/src/components/App.jsx

import React, { useState, useRef, useEffect } from "react";
import ToolBar from "./ToolBar";

// 将 hex 字符串转为 Uint8Array
function hexToBytes(hex) {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// 样式常量
const OUTLINE_COLOR = "rgb(0, 0, 255)";
const OUTLINE_WIDTH = 5;
const HOVER_COLOR = "rgba(255,255,255,0.7)";
const HOVER_WIDTH = 8;
const SELECT_GLOW_COLOR = "rgba(0, 255, 255, 0.7)";
const SELECT_GLOW_BLUR = 15;
const SELECT_DOT_COLOR = "rgba(0, 255, 255, 1)";
const SELECT_DOT_RADIUS = 6;

/**
 * 在 Canvas 上绘制平滑多边形，用 quadraticCurveTo
 */
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

/**
 * 构建 Path2D 用于命中检测 —— 同样做平滑
 */
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

  const canvasRef = useRef(null);
  const pathsRef = useRef([]);

  // 上传图片
  const handleUploadImage = (file) => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageFile(file);
    setMasks([]);
    setHoveredMaskId(null);
    setSelectedMaskId(null);
  };

  // Everything 分割
  const handleSegmentEverything = async () => {
    if (!imageFile) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", imageFile);
      const res = await fetch("http://localhost:8001/segmentEverything", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { masks: dataMasks } = await res.json();
      const parsed = dataMasks.map((m) => {
        const bytes = hexToBytes(m.segmentation);
        const blob = new Blob([bytes], { type: "image/png" });
        return { ...m, url: URL.createObjectURL(blob) };
      });
      setMasks(parsed);
    } catch (err) {
      console.error("Segmentation error:", err);
      alert("分割出错：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Box 分割（示例）
  const handleSegmentBox = async () => {
    if (!imageFile) return;
    setLoading(true);
    try {
      const box = [50, 50, 200, 200];
      const form = new FormData();
      form.append("file", imageFile);
      form.append("box", JSON.stringify(box));
      const res = await fetch("http://localhost:8001/segmentBox", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { mask } = await res.json();
      const bytes = hexToBytes(mask.segmentation);
      const blob = new Blob([bytes], { type: "image/png" });
      setMasks([{ ...mask, url: URL.createObjectURL(blob) }]);
    } catch (err) {
      console.error("Box segmentation error:", err);
      alert("Box 分割出错：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 重绘与命中路径构建
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // 先绘制所有 mask
      masks.forEach((m) => {
        const [r, g, b] = m.color;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
        drawSmoothPolygon(ctx, m.polygon);
        ctx.fill();

       ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        drawSmoothPolygon(ctx, m.polygon);
        ctx.stroke();
      });

      // 构建平滑 Path2D 供命中检测
      pathsRef.current = masks.map((m) => ({
        id: m.id,
        path: buildSmoothPath(m.polygon),
        polygon: m.polygon,
        color: m.color,
      }));

      // 悬停高亮
      if (hoveredMaskId != null && hoveredMaskId !== selectedMaskId) {
        const hit = pathsRef.current.find((h) => h.id === hoveredMaskId);
        if (hit) {
          ctx.save();
          ctx.strokeStyle = HOVER_COLOR;
          ctx.lineWidth = HOVER_WIDTH;
          ctx.setLineDash([5, 3]);
          ctx.stroke(hit.path);
          ctx.restore();
        }
      }

      // 选中时背景变暗 + 重绘非选中 + 高亮选中
      if (selectedMaskId != null) {
        // 蒙层
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // 非选中目标（暗色）
        masks
          .filter((m) => m.id !== selectedMaskId)
          .forEach((m) => {
            const [r, g, b] = m.color;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
            drawSmoothPolygon(ctx, m.polygon);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,112,255,0.5)";
            ctx.lineWidth = OUTLINE_WIDTH;
            drawSmoothPolygon(ctx, m.polygon);
            ctx.stroke();
          });

        // 选中目标发光 + 中心点
        const hit = pathsRef.current.find((h) => h.id === selectedMaskId);
        if (hit) {
          // 填充
          const [r, g, b] = hit.color;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
          drawSmoothPolygon(ctx, hit.polygon);
          ctx.fill();

          // 发光描边
          ctx.save();
          ctx.strokeStyle = SELECT_GLOW_COLOR;
          ctx.lineWidth = OUTLINE_WIDTH;
          ctx.shadowBlur = SELECT_GLOW_BLUR;
          ctx.shadowColor = SELECT_GLOW_COLOR;
          drawSmoothPolygon(ctx, hit.polygon);
          ctx.stroke();
          ctx.restore();

          // 质心小圆
          const pts = hit.polygon;
          const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
          const cy = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
          ctx.save();
          ctx.fillStyle = SELECT_DOT_COLOR;
          ctx.beginPath();
          ctx.arc(cx, cy, SELECT_DOT_RADIUS, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();
        }
      }
    };
  }, [imageUrl, masks, hoveredMaskId, selectedMaskId]);

  // 悬停检测
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const ctx = canvas.getContext("2d");
    let found = null;
    for (const { id, path } of pathsRef.current) {
      if (ctx.isPointInPath(path, x, y)) {
        found = id;
        break;
      }
    }
    setHoveredMaskId(found);
  };

  // 点击选中/取消
  const handleClick = () => {
    if (hoveredMaskId != null) {
      setSelectedMaskId(
        hoveredMaskId === selectedMaskId ? null : hoveredMaskId
      );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-800">
      <ToolBar
        onUploadImage={handleUploadImage}
        onToolChange={(tool) => console.log("Switch tool:", tool)}
        onSegmentEverything={handleSegmentEverything}
        onCutout={() => console.log("cutout")}
        currentTool={"everything"}
        hasImage={!!imageUrl}
        hasMasks={masks.length > 0}
        hasSelection={selectedMaskId != null}
      />
      <div className="flex-1 relative flex items-center justify-center p-4">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        {imageUrl ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[80vh] border border-gray-600"
            onMouseMove={handleMouseMove}
            onClick={handleClick}
          />
        ) : (
          <span className="text-gray-400">请上传图片</span>
        )}
      </div>
    </div>
  );
}
