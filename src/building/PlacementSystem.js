/**
 * PlacementSystem.js
 *
 * 放置系统是“用户意图”和“地图数据”之间的桥梁。
 * 输入层只告诉它：当前选中的素材想放到哪个格子；
 * 它负责查询素材配置、判断能否放置，并最终修改 TileMap。
 */

// terrain 地形类：只要格子在地图内，就能放置，会替换该格地形。
// object 模型类：必须整个 footprint 都在地图内，并且这些格子没有被其他模型占用。
// 当前逻辑不检查地形类型，所以模型理论上可以放在草地、石路、水面等任意地形上，只要没有别的 object 占用。

import { ASSET_INDEX } from '../assets/assetManifest.js';
import { PlacedObject } from './PlacedObject.js';

export class PlacementSystem {
    constructor(tileMap) {
        this.tileMap = tileMap;
    }

    /**
     * 判断指定素材能否放在 (gx, gy)。
     *
     * 二次开发放置规则时，优先改这里：
     * - 地形类目前只要求在地图范围内，会直接替换该格地形。
     * - 模型类目前要求 footprint 完整落在地图内，并且占用格没有其他模型。
     * - 如果要限制“建筑不能放水上”“桥只能放水上”等规则，也适合写在这里。
     */
    canPlace(assetId, gx, gy) {
        const asset = ASSET_INDEX[assetId];
        if (!asset) return false;

        if (asset.kind === 'terrain') {
            return this.tileMap.inBounds(gx, gy);
        }

        // 模型类：整个 footprint 必须在地图内，并且所有占用格都没有其他模型。
        return this.tileMap.isFreeFor(gx, gy, asset.footprint.w, asset.footprint.d);
    }

    place(assetId, gx, gy, opts = {}) {
        const asset = ASSET_INDEX[assetId];
        if (!asset || !this.canPlace(assetId, gx, gy)) return null;

        if (asset.kind === 'terrain') {
            // 替换地形不会影响上方模型；比如可以在已有树/房子下改草地为石路。
            this.tileMap.setTerrain(gx, gy, assetId);
            return { kind: 'terrain', gx, gy, assetId };
        }

        const obj = new PlacedObject({
            id: this.tileMap.nextId(),
            assetId,
            gx,
            gy,
            footprint: asset.footprint,
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        this.tileMap.addObject(obj);
        return { kind: 'object', object: obj };
    }

    /**
     * 擦除 (gx, gy) 上的内容。
     * 如果该格同时有模型和地形，优先擦除模型；再次擦除才会清掉地形。
     *
     * 返回 true 表示确实删除了内容。
     */
    erase(gx, gy) {
        const obj = this.tileMap.objectAt(gx, gy);
        if (obj) {
            this.tileMap.removeObjectAt(gx, gy);
            return true;
        }
        if (this.tileMap.getTerrain(gx, gy)) {
            this.tileMap.clearTerrain(gx, gy);
            return true;
        }
        return false;
    }
}
