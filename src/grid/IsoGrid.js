/**
 * IsoGrid.js
 *
 * 等距网格坐标换算工具。
 * 这里负责在“格子坐标 gx/gy”和“世界像素坐标 x/y”之间互相转换。
 */

import { CONFIG } from '../config.js';

const TW = CONFIG.tile.w;   // 单个等距地块的屏幕宽度，单位 px
const TH = CONFIG.tile.h;   // 单个等距地块的屏幕高度，单位 px

/**
 * 把格子坐标 (gx, gy) 转成世界像素坐标。
 * 返回的是该格菱形地块的锚点，也就是最靠后的顶角。
 */
export function cellToScreen(gx, gy) {
    return {
        x: (gx - gy) * (TW / 2),
        y: (gx + gy) * (TH / 2),
    };
}

/**
 * 反向换算：世界像素点 → 格子坐标。
 * 返回浮点数，调用方通常会 Math.floor 得到真正的格子索引。
 */
export function screenToCell(px, py) {
    const gx = (px / (TW / 2) + py / (TH / 2)) / 2;
    const gy = (py / (TH / 2) - px / (TW / 2)) / 2;
    return { gx, gy };
}

export function cellInBounds(gx, gy, w = CONFIG.grid.width, h = CONFIG.grid.height) {
    return gx >= 0 && gy >= 0 && gx < w && gy < h;
}
