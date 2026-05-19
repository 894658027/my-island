/**
 * InputManager.js
 *
 * 统一处理画布上的鼠标、触摸和键盘输入，并把浏览器事件转换成
 * Game 能理解的高层操作：放置、擦除、悬停预览、平移和缩放。
 *
 * 触控模型尽量对齐桌面端操作：
 *
 *   • 单指点击             → 主操作（根据当前工具放置或擦除）
 *   • 单指长按             → 次操作（擦除），相当于移动端右键
 *   • 单指拖动（放置工具） → 跨格子连续刷涂放置
 *   • 单指拖动（擦除工具） → 跨格子连续刷涂擦除
 *   • 单指拖动（平移工具） → 平移相机
 *   • 双指捏合             → 以双指中心为锚点缩放
 *   • 双指拖动             → 平移相机，不受当前工具影响
 */

import { CONFIG } from '../config.js';
import { screenToCell } from '../grid/IsoGrid.js';
import { playUiClick } from '../ui/Audio.js';

// 单指静止按住多久后触发“长按擦除”。这个值需要在响应速度和误触之间平衡。
const LONG_PRESS_MS = 420;
// 手指允许轻微漂移；超过这个像素距离后，取消长按计时并改判为拖动。
const TOUCH_MOVE_THRESHOLD = 8;
// 松手时仍可判定为点击的最大位移。
const TAP_SLOP = 10;
// 按住时长超过该值后，松手不再算普通点击。
const TAP_MAX_MS = 350;

export class InputManager {
    constructor(canvas, camera, game) {
        this.canvas = canvas;
        this.camera = camera;
        this.game = game;

        this._dragging = false;
        this._dragMoved = false;
        this._lastX = 0;
        this._lastY = 0;
        this._pressedButton = null;
        this._brushActive = false;
        this._lastBrushKey = null;

        // 触控状态独立于鼠标状态，避免触屏笔记本等混合设备上两套事件互相干扰。
        this._touches = new Map(); // touch.identifier → { x, y, startX, startY, startTime }
        this._touchMode = null;    // null | 'single' | 'pinch'
        this._touchMoved = false;
        this._touchSecondaryFired = false;
        this._longPressTimer = null;
        this._lastBrushTouchKey = null;
        this._pinchLastDist = 0;
        this._pinchLastMid = { x: 0, y: 0 };
        this._lastTouchScreen = null; // 当前活动手指的最后位置，用于松手点击判断

        this._bind();
    }

    _bind() {
        const c = this.canvas;
        c.addEventListener('mousedown',   e => this._onMouseDown(e));
        window.addEventListener('mousemove', e => this._onMouseMove(e));
        window.addEventListener('mouseup',   e => this._onMouseUp(e));
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel',       e => this._onWheel(e), { passive: false });

        // 触控事件必须使用 passive: false，才能 preventDefault 阻止页面滚动、
        // 浏览器自身缩放，以及移动端合成鼠标事件造成的重复触发。
        c.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive: false });
        c.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive: false });
        c.addEventListener('touchend',    e => this._onTouchEnd(e),    { passive: false });
        c.addEventListener('touchcancel', e => this._onTouchEnd(e),    { passive: false });

        window.addEventListener('keydown', e => this._onKeyDown(e));
    }

    _toCell(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        return { gx: Math.floor(c.gx), gy: Math.floor(c.gy), sx, sy };
    }

    _onMouseDown(e) {
        const { gx, gy, sx, sy } = this._toCell(e);
        this._dragging = true;
        this._dragMoved = false;
        this._lastX = sx;
        this._lastY = sy;
        this._pressedButton = e.button;

        const canBrush = this.game.tool !== 'pan'
            && (e.button === 0 || e.button === 2)
            && !e.shiftKey;
        if (canBrush) {
            e.preventDefault();
            this._brushActive = true;
            this._lastBrushKey = null;
            this._brushCell(gx, gy);
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        const cell = { gx: Math.floor(c.gx), gy: Math.floor(c.gy) };
        this.game.onHover(cell);

        if (!this._dragging) return;
        const dx = sx - this._lastX;
        const dy = sy - this._lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;

        if (this._brushActive && !e.shiftKey) {
            this._brushCell(cell.gx, cell.gy);
            this._lastX = sx;
            this._lastY = sy;
            return;
        }

        // 中键始终平移；左键只有在 pan 工具或按住 Shift 拖动时才平移。
        const panMode = this.game.tool === 'pan';
        if (this._pressedButton === 1 || panMode || (this._dragMoved && e.shiftKey)) {
            this.camera.pan(dx, dy);
        }
        this._lastX = sx;
        this._lastY = sy;
    }

    _onMouseUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        if (this._brushActive) {
            this._brushActive = false;
            this._lastBrushKey = null;
            this._pressedButton = null;
            return;
        }
        if (this._dragMoved) { this._pressedButton = null; return; }

        const { gx, gy } = this._toCell(e);

        if (e.button === 0) {
            this.game.onPrimaryClick(gx, gy);
        } else if (e.button === 2) {
            this.game.onSecondaryClick(gx, gy);
        }
        this._pressedButton = null;
    }

    _brushCell(gx, gy) {
        const key = `${gx},${gy}`;
        if (key === this._lastBrushKey) return;
        this._lastBrushKey = key;

        if (this._pressedButton === 0) {
            this.game.onPrimaryClick(gx, gy);
        } else if (this._pressedButton === 2) {
            this.game.onSecondaryClick(gx, gy);
        }
        this.game.onHover({ gx, gy });
    }

    _onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.camera.zoomAt(sx, sy, factor);
    }

    /* ── 触控输入 ─────────────────────────────────────────────── */

    _touchToCanvas(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    _screenToCellXY(sx, sy) {
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        return { gx: Math.floor(c.gx), gy: Math.floor(c.gy) };
    }

    _onTouchStart(e) {
        // 阻止浏览器生成合成鼠标事件、滚动页面或触发 iOS 双击缩放。
        e.preventDefault();

        for (const t of e.changedTouches) {
            const { x, y } = this._touchToCanvas(t);
            this._touches.set(t.identifier, {
                x, y,
                startX: x, startY: y,
                startTime: performance.now(),
            });
            this._lastTouchScreen = { x, y };
        }

        const n = this._touches.size;
        if (n === 1) {
            this._touchMode = 'single';
            this._touchMoved = false;
            this._touchSecondaryFired = false;
            this._lastBrushTouchKey = null;

            // 手指按下时立即更新悬停格子，让放置预览从触点位置开始跟随。
            const [tp] = this._touches.values();
            this.game.onHover(this._screenToCellXY(tp.x, tp.y));

            // 长按等同擦除。只在按下时安排一次计时；手指移动、抬起或第二根手指加入都会取消。
            this._clearLongPressTimer();
            this._longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                if (this._touches.size !== 1 || this._touchMoved) return;
                const cell = this._screenToCellXY(tp.x, tp.y);
                this._touchSecondaryFired = true;
                this.game.onSecondaryClick(cell.gx, cell.gy);
                if (navigator.vibrate) navigator.vibrate(18);
            }, LONG_PRESS_MS);
        } else if (n >= 2) {
            // 升级为双指手势。取消单指意图，避免第二根手指稍晚落下时误触发放置。
            this._clearLongPressTimer();
            this._touchMode = 'pinch';
            this._touchSecondaryFired = false;
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            this._pinchLastDist = Math.max(1, this._distance(a, b));
            this._pinchLastMid = this._midpoint(a, b);
        }
    }

    _onTouchMove(e) {
        e.preventDefault();

        for (const t of e.changedTouches) {
            const tp = this._touches.get(t.identifier);
            if (!tp) continue;
            const { x, y } = this._touchToCanvas(t);
            // 在 touch 对象上记录每帧位移，单指平移时可以直接计算相机偏移。
            tp.lastX = tp.x; tp.lastY = tp.y;
            tp.x = x; tp.y = y;
            this._lastTouchScreen = { x, y };
        }

        if (this._touchMode === 'single') {
            const [tp] = this._touches.values();
            const dx = tp.x - tp.startX;
            const dy = tp.y - tp.startY;
            if (!this._touchMoved && (Math.abs(dx) + Math.abs(dy)) > TOUCH_MOVE_THRESHOLD) {
                this._touchMoved = true;
                this._clearLongPressTimer();
            }
            // 拖动时持续更新预览格子，红/蓝可放置状态才能跟着手指实时变化。
            const cell = this._screenToCellXY(tp.x, tp.y);
            this.game.onHover(cell);

            if (!this._touchMoved) return;

            const tool = this.game.tool;
            if (tool === 'pan') {
                const fdx = tp.x - (tp.lastX ?? tp.x);
                const fdy = tp.y - (tp.lastY ?? tp.y);
                if (fdx || fdy) this.camera.pan(fdx, fdy);
            } else if (tool === 'place' || tool === 'erase') {
                const key = `${cell.gx},${cell.gy}`;
                if (key !== this._lastBrushTouchKey) {
                    this._lastBrushTouchKey = key;
                    // 主操作会尊重当前工具：擦除工具下擦除，放置工具下放置，和鼠标刷涂一致。
                    this.game.onPrimaryClick(cell.gx, cell.gy);
                }
            }
        } else if (this._touchMode === 'pinch') {
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            if (!a || !b) return;
            const dist = Math.max(1, this._distance(a, b));
            const mid  = this._midpoint(a, b);

            // 使用相邻两帧之间的缩放比例；相机缩放值本身会累积，这样手指加入/离开时更稳定。
            const factor = dist / this._pinchLastDist;
            if (factor !== 1) this.camera.zoomAt(mid.x, mid.y, factor);

            // 双指中心点移动时，同时平移相机。
            const pdx = mid.x - this._pinchLastMid.x;
            const pdy = mid.y - this._pinchLastMid.y;
            if (pdx || pdy) this.camera.pan(pdx, pdy);

            this._pinchLastDist = dist;
            this._pinchLastMid = mid;
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();

        // 先保存即将抬起的手指信息；Map 里的记录马上会被删除，点击判定还需要最终位置。
        let lifted = null;
        for (const t of e.changedTouches) {
            lifted = this._touches.get(t.identifier) || lifted;
            this._touches.delete(t.identifier);
        }

        const wasSingle = this._touchMode === 'single';
        const remaining = this._touches.size;

        if (wasSingle && remaining === 0 && lifted) {
            this._clearLongPressTimer();
            const elapsed = performance.now() - lifted.startTime;
            const dx = lifted.x - lifted.startX;
            const dy = lifted.y - lifted.startY;
            const moved = (Math.abs(dx) + Math.abs(dy)) > TAP_SLOP;
            const tap = !moved && elapsed < TAP_MAX_MS && !this._touchSecondaryFired;
            if (tap) {
                const cell = this._screenToCellXY(lifted.x, lifted.y);
                this.game.onPrimaryClick(cell.gx, cell.gy);
            }
        }

        if (remaining === 0) {
            this._touchMode = null;
            this._touchMoved = false;
            this._touchSecondaryFired = false;
            this._lastBrushTouchKey = null;
            this._clearLongPressTimer();
        } else if (remaining === 1 && this._touchMode === 'pinch') {
            // 双指退回单指时，把剩下的手指当作新的拖动起点，避免从旧位置突然跳动。
            // 同时标记为已移动，防止手势中途被误判成一次点击。
            const [tp] = this._touches.values();
            tp.startX = tp.x;
            tp.startY = tp.y;
            tp.startTime = performance.now();
            tp.lastX = tp.x;
            tp.lastY = tp.y;
            this._touchMode = 'single';
            this._touchMoved = true;
            this._touchSecondaryFired = true; // 再加一道保护，阻止松手点击触发
        }
    }

    _clearLongPressTimer() {
        if (this._longPressTimer != null) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    _distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _midpoint(a, b) {
        return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    }

    _onKeyDown(e) {
        // 用户正在输入文本时不响应快捷键，避免打字时误触发工具切换。
        if (e.target instanceof HTMLInputElement
            || e.target instanceof HTMLTextAreaElement) return;
        const k = e.key.toLowerCase();
        const map = {
            '1': () => this.game.setCategory('terrain'),
            '2': () => this.game.setCategory('nature'),
            '3': () => this.game.setCategory('props'),
            '4': () => this.game.setCategory('water'),
            '5': () => this.game.setCategory('buildings'),
            'e': () => this.game.setTool(this.game.tool === 'erase' ? 'place' : 'erase'),
            'g': () => this.game.toggleGrid(),
            's': () => this.game.save(),
            'r': () => this.game.reset(),
            'h': () => this.game.toggleFlipH(),
            'v': () => this.game.toggleFlipV(),
        };
        if (map[k]) {
            e.preventDefault();
            playUiClick();
            map[k]();
        }
    }
}
