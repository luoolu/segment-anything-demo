# backend/main.py

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import numpy as np
import cv2
import json

# ⚠️ 这里使用相对导入：从同包中的 sam_model.py 导入
from .sam_model import generate_masks, generate_mask_with_box

app = FastAPI()

# —— CORS 设置 ——
# 开发环境下允许所有源。生产请务必改为具体域名或列表。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],            # 允许所有域名发起的请求
    allow_credentials=True,         # 允许携带 Cookie
    allow_methods=["*"],            # 允许所有 HTTP 方法
    allow_headers=["*"],            # 允许所有请求头
)

@app.post("/segmentEverything")
async def segment_everything(
    file: UploadFile = File(...)
):
    """
    接收前端上传的图片，执行自动多掩码分割
    返回：{"masks": [ {id, polygon, segmentation (hex), color}, ... ]}
    """
    try:
        data = await file.read()
        nparr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        results = generate_masks(img)
        for m in results:
            _, buf = cv2.imencode(".png", m["segmentation"])
            m["segmentation"] = buf.tobytes().hex()
        return JSONResponse({"masks": results})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/segmentBox")
async def segment_box(
    file: UploadFile = File(...),
    box: str = Form(...)
):
    """
    接收图片和框 box (JSON 字符串)，执行单掩码分割
    返回：{mask: {id, polygon, segmentation (hex), color}}
    """
    try:
        coords = json.loads(box)
        data = await file.read()
        nparr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        result = generate_mask_with_box(img, tuple(coords))
        _, buf = cv2.imencode(".png", result["segmentation"])
        result["segmentation"] = buf.tobytes().hex()
        return JSONResponse({"mask": result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",  # 确保这里也是 backend.main:app
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
