/**
 * TileMap.js
 *
 * 存储整个世界的两层数据：
 *   - terrain：二维地形网格，每个格子保存一个地形素材 id。
 *   - objects：已放置模型列表，每个模型可以占用一个或多个格子。
 *
 * TileMap 是地图状态的唯一数据源。渲染器、放置系统、保存系统都以它为准。
 *
 * 性能说明：
 *   - `_occupancy` 是一张“格子 → 占用它的模型”的索引表。
 *     objectAt 和 isFreeFor 可以按格子 O(1) 查询，不需要每次遍历 objects。
 *     鼠标悬停时 canPlace 会高频调用，这个索引能避免预览卡顿。
 *   - terrainVersion / objectsVersion 会在数据变化时递增，
 *     渲染器据此判断哪些缓存图层需要重建。
 */

import { CONFIG } from '../config.js';

export class TileMap {
    constructor(width = CONFIG.grid.width, height = CONFIG.grid.height) {
        this.width = width;
        this.height = height;
        this.terrain = new Array(width * height).fill(null);
        this.objects = []; // 已放置模型列表，元素类型是 PlacedObject
        this._occupancy = new Array(width * height).fill(null);
        this._nextId = 1;

        // 任意数据变化都会递增版本号，渲染器用它判断是否需要重建缓存画布。
        this.terrainVersion = 0;
        this.objectsVersion = 0;
    }

    nextId() { return this._nextId++; }

    inBounds(gx, gy) {
        return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height;
    }

    setTerrain(gx, gy, assetId) {
        if (!this.inBounds(gx, gy)) return;
        const idx = gy * this.width + gx;
        if (this.terrain[idx] === assetId) return;
        this.terrain[idx] = assetId;
        this.terrainVersion++;
    }
    getTerrain(gx, gy) {
        if (!this.inBounds(gx, gy)) return null;
        return this.terrain[gy * this.width + gx];
    }
    clearTerrain(gx, gy) { this.setTerrain(gx, gy, null); }

    /**
     * 返回覆盖 (gx, gy) 的模型；如果没有模型则返回 null。
     * 依赖 _occupancy 索引，因此是按格子 O(1) 查询。
     */
    objectAt(gx, gy) {
        if (!this.inBounds(gx, gy)) return null;
        return this._occupancy[gy * this.width + gx] || null;
    }

    /**
     * 判断以 (gx, gy) 为左后角、大小为 w x d 的矩形 footprint 是否可用。
     * 目前只检查边界和 object 占用，不检查地形类型。
     */
    isFreeFor(gx, gy, w, d) {
        for (let ix = 0; ix < w; ix++)
        for (let iy = 0; iy < d; iy++) {
            const cx = gx + ix, cy = gy + iy;
            if (!this.inBounds(cx, cy)) return false;
            if (this._occupancy[cy * this.width + cx]) return false;
        }
        return true;
    }

    addObject(obj) {
        this.objects.push(obj);
        this._stampOccupancy(obj, obj);
        this.objectsVersion++;
    }

    removeObjectAt(gx, gy) {
        const target = this.objectAt(gx, gy);
        if (!target) return null;
        const idx = this.objects.indexOf(target);
        if (idx === -1) return null;
        this.objects.splice(idx, 1);
        this._stampOccupancy(target, null);
        this.objectsVersion++;
        return target;
    }

    clearAll() {
        this.terrain.fill(null);
        this._occupancy.fill(null);
        this.objects.length = 0;
        this._nextId = 1;
        this.terrainVersion++;
        this.objectsVersion++;
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            terrain: this.terrain,
            objects: this.objects.map(o => o.serialize()),
        };
    }

    /**
     * 用保存文件里的快照替换当前地图内容。
     * objectFactory(data) -> PlacedObject 由调用方传入，用来避免模块循环依赖。
     */
    deserialize(data, objectFactory) {
        if (!data) return;
        this.width  = data.width;
        this.height = data.height;
        this.terrain = data.terrain ?? new Array(this.width * this.height).fill(null);
        this.objects = (data.objects ?? []).map(objectFactory);
        this._occupancy = new Array(this.width * this.height).fill(null);
        for (const obj of this.objects) this._stampOccupancy(obj, obj);
        this._nextId = this.objects.length + 1;
        this.terrainVersion++;
        this.objectsVersion++;
    }

    _stampOccupancy(obj, value) {
        const fp = obj.footprint || { w: 1, d: 1 };
        for (let ix = 0; ix < fp.w; ix++)
        for (let iy = 0; iy < fp.d; iy++) {
            const cx = obj.gx + ix, cy = obj.gy + iy;
            if (!this.inBounds(cx, cy)) continue;
            this._occupancy[cy * this.width + cx] = value;
        }
    }
}
