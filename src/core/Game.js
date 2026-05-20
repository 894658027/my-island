/**
 * Game.js
 *
 * 游戏的顶层控制器，负责把世界数据、相机、渲染器、输入、放置系统和 UI 串起来。
 * UI 与输入层不会直接改地图，而是通过这里暴露的意图方法
 * （setTool、selectAsset、save、reset 等）进入同一套状态流。
 */

import { CONFIG } from '../config.js';
import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { TileMap } from '../grid/TileMap.js';
import { PlacementSystem } from '../building/PlacementSystem.js';
import { ASSET_INDEX, ASSET_MANIFEST } from '../assets/assetManifest.js';
import { SaveSystem } from '../storage/SaveSystem.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { playPlacementFor } from '../ui/Audio.js';

export class Game {
    constructor(canvas, ui = null) { 
        this.canvas = canvas;
        this.tileMap = new TileMap();
        this.camera = new Camera();
        this.renderer = new Renderer(canvas, this.camera, this.tileMap);
        this.placement = new PlacementSystem(this.tileMap);
        this.input = new InputManager(canvas, this.camera, this);

        // 相机发生平移、缩放或重新居中时，需要通知渲染器下一帧重画。
        // 渲染器本身会在无变化时跳过昂贵绘制。
        this.camera.onChange(() => this.renderer.markDirty());

        // 默认进入放置模式，并选中第一个地形素材。
        this.tool = 'place';                  // 'place' | 'erase' | 'pan'
        this.category = 'terrain';
        this.selectedAssetId = ASSET_MANIFEST.find(a => a.category === 'terrain').id;
        this.ui = ui;

        // 当前选中素材的预览翻转状态。用户按 H / V 切换；
        // 真正放置时会把这两个值写入 PlacedObject。
        this.flipH = false;
        this.flipV = false;

        // 启动时把相机对准网格中心。
        this._centerCamera();

        // 启动渲染循环。
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _centerCamera() {
        const c = cellToScreen(this.tileMap.width / 2, this.tileMap.height / 2);
        const { innerWidth: w, innerHeight: h } = window;
        this.camera.centerOn(c.x, c.y, w, h);
    }

    /* ── 来自 UI / 输入层的操作意图 ───────────────────────────── */

    setTool(t) {
        this.tool = t;
        this.renderer.eraseMode = (t === 'erase');
        this.canvas.style.cursor = t === 'pan' ? 'grab'
                                  : t === 'erase' ? 'crosshair'
                                  : 'crosshair';
        this.renderer.markDirty();
        this.ui?.update();
    }

    setCategory(cat) {
        if (this.category === cat) return;
        this.category = cat;
        // 切换分类时，自动选中该分类下的第一个素材。
        const first = ASSET_MANIFEST.find(a => a.category === cat);
        if (first) this.selectedAssetId = first.id;
        this._resetFlip();
        this.renderer.markDirty();
        this.ui?.update();
    }

    selectAsset(id) {
        const a = ASSET_INDEX[id];
        if (!a) return;
        const changed = this.selectedAssetId !== id;
        this.selectedAssetId = id;
        this.category = a.category;
        if (changed) this._resetFlip();
        // 选择素材意味着用户准备放置；如果当前是擦除模式，就切回放置模式。
        if (this.tool === 'erase') this.setTool('place');
        this.renderer.markDirty();
        this.ui?.update();
    }

    toggleFlipH() {
        this.flipH = !this.flipH;
        this._syncPreviewFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`水平翻转：${this.flipH ? '开' : '关'}`);
        this.ui?.update();
    }

    toggleFlipV() {
        this.flipV = !this.flipV;
        this._syncPreviewFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`垂直翻转：${this.flipV ? '开' : '关'}`);
        this.ui?.update();
    }

    _resetFlip() {
        this.flipH = false;
        this.flipV = false;
        this._syncPreviewFlip();
    }

    _syncPreviewFlip() {
        this.renderer.previewFlipH = this.flipH;
        this.renderer.previewFlipV = this.flipV;
    }

    toggleGrid() {
        this.renderer.showGrid = !this.renderer.showGrid;
        this.renderer.markDirty();
        this.ui?.hud?.syncToggles();
        this.ui?.update();
    }

    /**
     * 切换地形之间是否显示菱形拼缝（也就是用户感知的"地块边缘那条线"）。
     * 关闭时，渲染器会让每块地形向外多画 1px，相邻菱形互相覆盖，看不到缝。
     */
    toggleBorders() {
        this.renderer.showBorders = !this.renderer.showBorders;
        this.renderer.markDirty();
        this.ui?.hud?.syncToggles();
        this.ui?.update();
    }

    /**
     * 演示用：调用 3 秒后自动移除地块边缘的"网线"。
     * 如果当前已经是无线状态则什么也不做。
     * 走的是 toggleBorders 同一条状态流，工具栏按钮和 HUD 开关会一起同步。
     */
    test() {
        console.log('[test] 已安排，3 秒后将尝试移除网线。当前 showBorders =',
            this.renderer.showBorders);
        return setTimeout(() => {
            if (this.renderer.showBorders) {
                this.toggleBorders();
                console.log('[test] 计时到，已隐藏网线');
            } else {
                console.log('[test] 计时到，但当前已经是无线状态，跳过');
            }
        }, 3000);
    }

    save() {
        const ok = SaveSystem.save(this.tileMap, this.camera);
        this.ui?.showToast(ok ? '小岛已保存' : '保存失败');
    }

    load() {
        const ok = SaveSystem.load(this.tileMap, this.camera);
        if (ok) this.renderer.markDirty();
        return ok;
    }

    reset() {
        this.tileMap.clearAll();
        SaveSystem.clear();
        this._centerCamera();
        this.renderer.markDirty();
        this.ui?.showToast('世界已重置');
    }

    /**
     * 一键给整张地图补草地。只有空地形格会被填充；
     * 已经放了石路、沙地、水面等地形的格子会保留，避免覆盖玩家已有设计。
     *
     * 每个格子会走和初始场景相同的错峰动画，看起来像草地沿对角线铺开，
     * 而不是整张地图瞬间闪一下。
     *
     * 返回实际填充的格子数量。
     */
    fillGrass() {
        const W = this.tileMap.width;
        const H = this.tileMap.height;
        // 与初始场景揭幕动画保持一致的波纹节奏。
        const STEP_MS = 32;
        let filled = 0;
        for (let gy = 0; gy < H; gy++)
        for (let gx = 0; gx < W; gx++) {
            if (this.tileMap.getTerrain(gx, gy)) continue;
            if (this.placeAndAnimate('grass', gx, gy, { delay: (gx + gy) * STEP_MS })) {
                filled++;
            }
        }
        if (filled > 0) {
            // 只在开始时播放一次音效；否则每格都播放会在瞬间叠出大量声音。
            playPlacementFor('grass');
            this.ui?.showToast(`已用草地铺满 ${filled} 个格子`);
        } else {
            this.ui?.showToast('网格已经铺满');
        }
        return filled;
    }

    /* ── InputManager 回调：悬停、放置、擦除 ─────────────────── */

    onHover(cell) {
        const prev = this.renderer.hoverCell;
        const sameCell = prev && prev.gx === cell.gx && prev.gy === cell.gy;
        this.renderer.hoverCell = cell;
        if (this.tool === 'erase') {
            this.renderer.previewAssetId = null;
            this.renderer.previewValid = !!this.tileMap.objectAt(cell.gx, cell.gy)
                || !!this.tileMap.getTerrain(cell.gx, cell.gy);
        } else if (this.tool === 'place') {
            this.renderer.previewAssetId = this.selectedAssetId;
            this.renderer.previewValid = this.placement.canPlace(this.selectedAssetId, cell.gx, cell.gy);
        } else {
            this.renderer.previewAssetId = null;
            this.renderer.previewValid = true;
        }
        // 鼠标移动事件非常频繁；只有悬停格子变化时才标记重绘，避免空转。
        if (!sameCell) this.renderer.markDirty();
    }

    onPrimaryClick(gx, gy) {
        if (!this.tileMap.inBounds(gx, gy)) return;
        if (this.tool === 'erase') {
            // 先记录将被删除的素材，用于选择合适的音效。
            // 例如擦除水面播放水声，其他素材播放普通放置/移除声。
            const objHere = this.tileMap.objectAt(gx, gy);
            const terrainHere = this.tileMap.getTerrain(gx, gy);
            const targetId = objHere ? objHere.assetId : terrainHere;
            if (this.placement.erase(gx, gy)) {
                this.renderer.markDirty();
                playPlacementFor(targetId);
            }
        } else if (this.tool === 'place') {
            const result = this.placement.place(this.selectedAssetId, gx, gy, {
                flipH: this.flipH,
                flipV: this.flipV,
            });
            if (result?.kind === 'object') {
                const o = result.object;
                this.renderer.spawnAnim(`obj-${o.id}`, {
                    gx: o.gx,
                    gy: o.gy,
                    w: o.footprint?.w ?? 1,
                    d: o.footprint?.d ?? 1,
                });
                playPlacementFor(o.assetId);
            } else if (result?.kind === 'terrain') {
                this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                    gx: result.gx,
                    gy: result.gy,
                    w: 1,
                    d: 1,
                });
                playPlacementFor(result.assetId);
            }
        }
    }

    onSecondaryClick(gx, gy) {
        // 右键不受当前工具影响，始终执行擦除。
        if (!this.tileMap.inBounds(gx, gy)) return;
        const objHere = this.tileMap.objectAt(gx, gy);
        const terrainHere = this.tileMap.getTerrain(gx, gy);
        const targetId = objHere ? objHere.assetId : terrainHere;
        if (this.placement.erase(gx, gy)) {
            this.renderer.markDirty();
            playPlacementFor(targetId);
        }
    }

    /**
     * 放置素材并安排弹性落位动画，可通过 opts.delay 延迟开始。
     * 初始场景使用它让村庄从后到前依次出现，玩家能看到世界逐步搭建起来。
     *
     * 返回放置结果；如果 canPlace 拒绝放置，则返回 null。
     */
    placeAndAnimate(assetId, gx, gy, opts = {}) {
        const result = this.placement.place(assetId, gx, gy, {
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        if (!result) return null;
        const startAt = performance.now() + (opts.delay ?? 0);
        const duration = opts.duration ?? 460;
        if (result.kind === 'object') {
            const o = result.object;
            this.renderer.spawnAnim(`obj-${o.id}`, {
                gx: o.gx,
                gy: o.gy,
                w: o.footprint?.w ?? 1,
                d: o.footprint?.d ?? 1,
            }, duration, startAt);
        } else if (result.kind === 'terrain') {
            this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                gx: result.gx,
                gy: result.gy,
                w: 1,
                d: 1,
            }, duration, startAt);
        }
        return result;
    }

    /* ── 帧循环 ──────────────────────────────────────────────── */

    _loop() {
        // 渲染器在无脏标记、无动画时会自行跳过绘制，所以空闲时成本很低。
        // requestAnimationFrame 仍保持运转，保证输入或动画恢复时能立刻响应。
        this.renderer.draw();
        requestAnimationFrame(this._loop);
    }
}
