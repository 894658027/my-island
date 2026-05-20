/**
 * Camera.js
 *
 * 一个非常简单的二维相机，只支持"平移 + 等比缩放"。
 * 通过一个偏移量 (offsetX, offsetY) 加一个统一的缩放系数 zoom，
 * 把世界坐标（画布逻辑坐标）映射到屏幕像素坐标。
 *
 * 整套渲染管线对外只依赖 screenToWorld / worldToScreen 这两个换算函数，
 * 因此换相机算法（比如加旋转、加固定平移边界）只用动这一个文件。
 *
 * 二次开发常见入口：
 *   - 想限制相机不能拖出地图：在 pan() 里对 offsetX / offsetY 做 clamp。
 *   - 想改缩放范围或灵敏度：缩放范围在 config.js 的 camera 区段；
 *     灵敏度参考 InputManager._onWheel 里 `Math.exp(-deltaY * 0.0015)`。
 *   - 想做"按 R 一键回到默认视角"：调用 centerOn() 即可。
 */

import { CONFIG } from '../config.js';

export class Camera {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = CONFIG.camera.defaultZoom;
        // 可选回调；渲染器会订阅这个，相机变动时立即把脏标记打上，
        // 而不用每帧主动轮询 camera 状态。
        this._onChange = null;
    }

    onChange(cb) { this._onChange = cb; }
    _notify() { if (this._onChange) this._onChange(); }

    /** 屏幕像素坐标 → 世界（未缩放）坐标。 */
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.zoom,
            y: (sy - this.offsetY) / this.zoom,
        };
    }

    /** 世界坐标 → 屏幕像素坐标。 */
    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.offsetX,
            y: wy * this.zoom + this.offsetY,
        };
    }

    pan(dx, dy) {
        if (dx === 0 && dy === 0) return;
        this.offsetX += dx;
        this.offsetY += dy;
        this._notify();
    }

    zoomAt(screenX, screenY, factor) {
        const next = Math.max(CONFIG.camera.minZoom,
                     Math.min(CONFIG.camera.maxZoom, this.zoom * factor));
        if (next === this.zoom) return;
        // 缩放时让"光标/手指下方的那个世界点"保持不动，
        // 这样视觉上是以光标为中心放大/缩小，符合直觉。
        const before = this.screenToWorld(screenX, screenY);
        this.zoom = next;
        const after = this.screenToWorld(screenX, screenY);
        this.offsetX += (after.x - before.x) * this.zoom;
        this.offsetY += (after.y - before.y) * this.zoom;
        this._notify();
    }

    /** 把给定的世界坐标对准当前画布的中心。 */
    centerOn(wx, wy, canvasW, canvasH) {
        this.offsetX = canvasW / 2 - wx * this.zoom;
        this.offsetY = canvasH / 2 - wy * this.zoom;
        this._notify();
    }
}
