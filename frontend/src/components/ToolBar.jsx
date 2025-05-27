import React, { useRef } from "react";

export default function ToolBar({
  onUploadImage,
  onToolChange,
  onSegmentEverything,
  onCutout,
  currentTool, // Added prop
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
      e.target.value = null;
    }
  };

  // Helper to get button classes, highlighting the active tool
  const getButtonClass = (toolName) => {
    const baseClass = "px-3 py-1 rounded disabled:opacity-50";
    if (currentTool === toolName) {
      // Example: Brighter color for active tool
      if (toolName === "everything") return `${baseClass} bg-green-400 hover:bg-green-300`;
      if (toolName === "box") return `${baseClass} bg-yellow-400 hover:bg-yellow-300`;
      // Add other tools if necessary
      return `${baseClass} bg-gray-500`; // Fallback for unstyled active tool
    }
    // Default colors for inactive tools
    if (toolName === "everything") return `${baseClass} bg-green-600 hover:bg-green-500`; //
    if (toolName === "box") return `${baseClass} bg-yellow-600 hover:bg-yellow-500`; //
    return `${baseClass} bg-gray-700 hover:bg-gray-600`; // Fallback for unstyled inactive tool
  };


  return (
    <div className="flex items-center p-2 bg-gray-900 text-white space-x-2">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <button
        onClick={handleUploadClick}
        className="px-3 py-1 bg-blue-700 rounded hover:bg-blue-600" //
      >
        上传
      </button>
      <button
        disabled={!hasImage}
        onClick={() => {
            onToolChange("everything"); // Set tool to 'everything'
            onSegmentEverything();      // Then segment
        }}
        className={getButtonClass("everything")}
      >
        Everything
      </button>
      <button
        disabled={!hasImage}
        onClick={() => onToolChange("box")}
        className={getButtonClass("box")}
      >
        Box
      </button>
      <button
        disabled={!hasSelection} //
        onClick={onCutout}
        className="px-3 py-1 bg-red-600 rounded hover:bg-red-500 disabled:opacity-50" //
      >
        Cutout
      </button>
    </div>
  );
}