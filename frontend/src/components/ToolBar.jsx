import React, { useRef } from "react";

export default function ToolBar({
  onUploadImage,
  onToolChange,
  onSegmentEverything,
  onCutout,
  currentTool,
  hasImage,
  hasMasks,
  hasSelection,
}) {
  const fileInputRef = useRef(null);

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
      // 清空 input，以便同一张图能重复上传
      e.target.value = null;
    }
  };

  return (
    <div className="flex items-center p-2 bg-gray-900 text-white space-x-2">
      {/* 隐藏的文件 input */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      {/* 上传按钮 */}
      <button
        onClick={handleUploadClick}
        className="px-3 py-1 bg-blue-700 rounded hover:bg-blue-600"
      >
        上传
      </button>
      {/* Everything 分割 */}
      <button
        disabled={!hasImage}
        onClick={onSegmentEverything}
        className="px-3 py-1 bg-green-600 rounded hover:bg-green-500 disabled:opacity-50"
      >
        Everything
      </button>
      {/* Box 分割模式切换 */}
      <button
        disabled={!hasImage}
        onClick={() => onToolChange("box")}
        className="px-3 py-1 bg-yellow-600 rounded hover:bg-yellow-500 disabled:opacity-50"
      >
        Box
      </button>
      {/* Cutout 挖空 */}
      <button
        disabled={!hasSelection}
        onClick={onCutout}
        className="px-3 py-1 bg-red-600 rounded hover:bg-red-500 disabled:opacity-50"
      >
        Cutout
      </button>
    </div>
);
}
