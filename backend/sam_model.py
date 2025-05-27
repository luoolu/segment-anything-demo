"""
sam_model.py — SAM 模型加载与推理功能模块
自动模式：生成多掩码轮廓，过滤超大/边界目标，并通过 DistanceTransform+Watershed
进一步分割相邻粘连目标，保证输出多边形互不重叠。
"""

from __future__ import annotations
import cv2
import numpy as np
import torch

# ------------- 修复 NMS 兼容性 -------------
import torchvision.ops.boxes as _ops

def _patched_nms(boxes, scores, idxs, iou_threshold, **kwargs):
    if idxs.device != boxes.device:
        idxs = idxs.to(boxes.device)
    return _ops._batched_nms_vanilla(boxes, scores, idxs, iou_threshold)

_ops.batched_nms = _patched_nms
import segment_anything.automatic_mask_generator as amg
amg.batched_nms = _patched_nms

# --------- SAM 模型加载 ----------
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator, SamPredictor

_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CKPT_H = "/media/luolu/LOOLO/Model/sam_vit_h_4b8939.pth"  # ↔ 替换为你的 checkpoint 路径

sam = sam_model_registry["vit_h"](checkpoint=CKPT_H).to(_DEVICE)
mask_generator = SamAutomaticMaskGenerator(
    model=sam,
    points_per_side=128,
    points_per_batch=128,
    pred_iou_thresh=0.95,
    stability_score_thresh=0.90,
    stability_score_offset=1.0,
    box_nms_thresh=0.7,
    crop_n_layers=2,
    crop_nms_thresh=0.7,
    crop_overlap_ratio=512/1500,
    crop_n_points_downscale_factor=1,
    min_mask_region_area=500,
)
predictor = SamPredictor(sam)

# --------- 辅助：RGB 转换 ----------
def _ensure_rgb(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    if img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# --------- 调色板 & 颜色生成 ---------
_color_palette = [
    [255, 82, 82], [255, 179, 71], [253, 231, 76], [75, 181, 67],
    [67, 207, 206], [114, 47, 232], [226, 60, 148], [123, 123, 123],
    [255,   0,   0], [  0, 255,   0], [  0,   0, 255], [255, 255,   0],
    [  0, 255, 255], [255,   0, 255], [128, 128,   0], [128,   0, 128],
    [  0, 128, 128], [128, 128, 128], [192, 192, 192], [ 64,  64,  64]
]
def _color_gen():
    while True:
        for c in _color_palette:
            yield c
_color_cycle = _color_gen()

# 最大可接受 mask 面积比例（相对于整图面积），超出则过滤
MAX_AREA_RATIO = 0.2

def generate_masks(image: np.ndarray) -> list[dict]:
    """
    使用 SAM 自动模式生成原始 mask，过滤超大/边界目标，
    然后按面积降序，逐步在 non-overlap 区域上用 DistanceTransform+Watershed
    将相邻连通体分割开，最终输出互不重叠的多边形列表。
    每项格式：
      {
        "id": int,
        "polygon": [[x,y],...],
        "color": [r,g,b],
        "segmentation": 二值 uint8 mask ndarray
      }
    """
    rgb = _ensure_rgb(image)
    H, W = rgb.shape[:2]
    max_area = H * W * MAX_AREA_RATIO

    # 1) 原始 SAM mask 提取 & 简化 & 初步过滤
    raw = mask_generator.generate(rgb)
    temp_results: list[dict] = []
    for idx, m in enumerate(raw):
        seg = (m["segmentation"].astype(np.uint8)) * 255
        cnts, _ = cv2.findContours(seg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        cnt = max(cnts, key=lambda c: cv2.contourArea(c))
        area = cv2.contourArea(cnt)
        if area > max_area:
            continue
        # 过滤边界连通体
        x, y, w, h = cv2.boundingRect(cnt)
        if x <= 0 or y <= 0 or x + w >= W - 1 or y + h >= H - 1:
            continue
        # 多边形简化
        epsilon = 0.005 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        pts = approx.squeeze(1).tolist()
        if len(pts) < 3:
            continue
        temp_results.append({
            "id": idx,
            "polygon": pts,
            "color": next(_color_cycle),
            "segmentation": seg,
            "area": area,
        })

    # 2) 按面积降序 & 交叉重叠移除 & Watershed 分割
    temp_results.sort(key=lambda x: x["area"], reverse=True)
    occupancy = np.zeros((H, W), dtype=np.uint8)
    final_results: list[dict] = []
    next_id = 0

    for item in temp_results:
        seg_orig = item["segmentation"]
        non_overlap = ((seg_orig > 0) & (occupancy == 0)).astype(np.uint8) * 255
        if non_overlap.sum() == 0:
            continue

        # —— DistanceTransform + Watershed ——
        # sure background
        kernel = np.ones((3, 3), np.uint8)
        sure_bg = cv2.dilate(non_overlap, kernel, iterations=3)
        # sure foreground via distance transform
        dist = cv2.distanceTransform(non_overlap, cv2.DIST_L2, 5)
        _, sure_fg = cv2.threshold(dist, 0.5 * dist.max(), 255, 0)
        sure_fg = sure_fg.astype(np.uint8)
        unknown = cv2.subtract(sure_bg, sure_fg)
        # markers
        _, markers = cv2.connectedComponents(sure_fg)
        markers = markers + 1
        markers[unknown == 255] = 0
        markers = cv2.watershed(rgb, markers)

        # 逐 label 分割连通体
        num_labels = markers.max()
        for lbl in range(2, num_labels + 1):
            region = (markers == lbl).astype(np.uint8)
            if region.sum() == 0:
                continue
            # 重提轮廓 & 简化
            cnts_r, _ = cv2.findContours(region * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cnts_r:
                continue
            cnt_r = max(cnts_r, key=lambda c: cv2.contourArea(c))
            epsilon_r = 0.005 * cv2.arcLength(cnt_r, True)
            approx_r = cv2.approxPolyDP(cnt_r, epsilon_r, True)
            pts_r = approx_r.squeeze(1).tolist()
            if len(pts_r) < 3:
                continue
            # 更新占用图
            occupancy[region == 1] = 1
            # 保存结果
            final_results.append({
                "id": next_id,
                "polygon": pts_r,
                "color": item["color"],
                "segmentation": (region * 255).astype(np.uint8),
            })
            next_id += 1

    return final_results

def generate_mask_with_box(image: np.ndarray, box: tuple[int, int, int, int]) -> dict:
    """
    基于框的单掩码分割，无交叉后处理，仅返回简化后的单个多边形。
    """
    rgb = _ensure_rgb(image)
    predictor.set_image(rgb)
    masks, scores, _ = predictor.predict(
        box=np.array([box]), multimask_output=False
    )
    seg = (masks[0].astype(np.uint8)) * 255
    cnts, _ = cv2.findContours(seg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = cnts[0] if cnts else None
    pts = cnt.squeeze(1).tolist() if cnt is not None else []
    return {
        "id": 0,
        "polygon": pts,
        "color": next(_color_cycle),
        "segmentation": seg,
    }
