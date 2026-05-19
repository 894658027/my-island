/**
 * PlacedObject.js
 *
 * 已放置模型的数据对象。
 * 它只描述“哪个素材放在了哪个格子、占几格、是否翻转”，不直接负责渲染或碰撞判断。
 */

export class PlacedObject {
    constructor({ id, assetId, gx, gy, footprint, flipH = false, flipV = false }) {
        this.id = id;             // 运行时唯一 id，用于动画和对象区分
        this.assetId = assetId;   // 对应 assetManifest.js 里的素材 id
        this.gx = gx;             // footprint 起点的网格 x，约定为模型占地区域的左后角
        this.gy = gy;             // footprint 起点的网格 y
        this.footprint = footprint; // 占地尺寸 { w, d }，单位是格子
        this.flipH = !!flipH;     // 屏幕水平翻转
        this.flipV = !!flipV;     // 屏幕垂直翻转
    }

    occupies(gx, gy) {
        return gx >= this.gx && gx < this.gx + this.footprint.w
            && gy >= this.gy && gy < this.gy + this.footprint.d;
    }

    /** 返回该模型覆盖的所有格子，按行优先顺序排列。 */
    cells() {
        const out = [];
        for (let ix = 0; ix < this.footprint.w; ix++)
        for (let iy = 0; iy < this.footprint.d; iy++) {
            out.push({ gx: this.gx + ix, gy: this.gy + iy });
        }
        return out;
    }

    /** 用于深度排序：越靠前的格子 gx+gy 越大，越需要晚绘制。 */
    sortKey() {
        // 用 footprint 最前方格子作为排序依据，确保大模型能盖住它后方的模型。
        return (this.gx + this.footprint.w - 1) + (this.gy + this.footprint.d - 1);
    }

    serialize() {
        return {
            id: this.id,
            assetId: this.assetId,
            gx: this.gx,
            gy: this.gy,
            footprint: { ...this.footprint },
            flipH: this.flipH,
            flipV: this.flipV,
        };
    }
}
