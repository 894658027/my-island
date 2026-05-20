/**
 * assetLoader.js
 *
 * 负责把 /assets/ 下的 PNG 素材包加载进运行时。
 *
 * 对 assetManifest.js 里的每一条素材定义，会走这样一条流水线：
 *   1. 优先去 /assets/<filename> 取图；
 *   2. 取到后丢给 imageToAsset() 切割成等距菱形、推断锚点、生成统一格式；
 *   3. 如果没取到（图还没画好 / 文件名拼错 / 网络出错），退化到
 *      assetDefinitions 里的程序化体素 builder 兜底，编辑器仍然可用。
 *
 * 最终目标是每个素材都有真实 PNG，运行时永远走不到兜底分支。
 *
 * 二次开发常见入口：
 *   - 加新素材：通常只需在 assetManifest.js 加一项 + 把 PNG 丢进 assets/，
 *     这里不用改。
 *   - 想改素材清晰度/性能：调上方的 DISPLAY_SUPERSAMPLE 常量。
 *   - 想改阴影模糊半径/质量：调 SHADOW_BLUR_PX / SHADOW_SUPERSAMPLE。
 *   - 想改"什么样的素材投不投阴影"：改下方判断 shadowCanvas 的那段。
 */

import { ASSET_MANIFEST } from './assetManifest.js';
import { imageToAsset, loadImageElement } from './imageToAsset.js';
import { renderVoxels } from './voxelRenderer.js';

let _assets = null;

/**
 * 素材预渲染的几个画质参数。
 *
 * DISPLAY_SUPERSAMPLE：
 *   每个素材在加载时会被烘焙成一张 "displayCanvas"，
 *   其分辨率 ≈ 素材在画面上显示的尺寸 × 这个倍数。
 *   渲染时只会做一次"displayCanvas → 屏幕"的缩放，
 *   不再每帧把多 MB 的原图重新降采样。
 *   该倍数大致取 maxZoom × devicePixelRatio（典型 Retina = 6），
 *   再在 buildDisplayCanvas 里"不会超过原 PNG 分辨率"做封顶，
 *   既保证最大缩放下仍然锐利，也不浪费内存。
 *
 * SHADOW_SUPERSAMPLE / SHADOW_BLUR_PX：
 *   阴影在加载时就预先渲染好一张已模糊的剪影 PNG，
 *   后续每帧只做带变换的 drawImage，
 *   渲染循环里彻底不需要走慢速的 ctx.filter blur 路径。
 */
const DEFAULT_DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
const MAX_ZOOM    = 3.0;
const DISPLAY_SUPERSAMPLE = Math.max(2, Math.ceil(MAX_ZOOM * DEFAULT_DPR));
const SHADOW_SUPERSAMPLE  = 1;
const SHADOW_BLUR_PX      = 6;

/**
 * 把素材的原始画布预先降采样到 "显示尺寸 × DISPLAY_SUPERSAMPLE" 的中间画布。
 * 渲染循环始终按素材的逻辑显示尺寸 (width, height) 来 blit 这张中间画布，
 * 所以浏览器每帧只会缩放这张"中等大小的中间图"，
 * 而不是把动辄 1~2k 的原图重新降采样。
 *
 * 如果原图本来就比目标尺寸小（即 PNG 分辨率不够），就直接返回原画布，
 * 否则反而是多花一道无意义的放大开销。
 */
function buildDisplayCanvas(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return srcCanvas;
    const targetW = Math.max(1, Math.ceil(displayW * DISPLAY_SUPERSAMPLE));
    const targetH = Math.max(1, Math.ceil(displayH * DISPLAY_SUPERSAMPLE));
    if (targetW >= srcCanvas.width && targetH >= srcCanvas.height) {
        // 原图比预渲染目标还小，再放大反而损失质量，直接复用原画布。
        return srcCanvas;
    }
    const out = document.createElement('canvas');
    out.width  = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d');
    if (!ctx) return srcCanvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    return out;
}

/**
 * 为投射阴影预渲染一张已经模糊好的黑色剪影画布：
 *   - 先在尺寸略大于显示尺寸的临时画布上画出原图；
 *   - 用 source-in 把它涂成纯黑剪影；
 *   - 再走一次 ctx.filter blur 得到柔和阴影。
 *
 * 这样每帧只需要 drawImage 这张已模糊好的剪影，
 * 完全绕开慢速的 ctx.filter 路径，也不会每帧上传全分辨率剪影到 GPU。
 */
function buildShadowCanvas(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return null;
    const targetW = Math.max(1, Math.ceil(displayW * SHADOW_SUPERSAMPLE));
    const targetH = Math.max(1, Math.ceil(displayH * SHADOW_SUPERSAMPLE));
    const pad = Math.ceil(SHADOW_BLUR_PX * 2.5);
    const w = targetW + pad * 2;
    const h = targetH + pad * 2;

    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    if (!tctx) return null;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(srcCanvas, pad, pad, targetW, targetH);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, w, h);

    // 加载时一次性把模糊做完。如果浏览器不支持 ctx.filter，
    // 就直接交付未模糊的剪影；渲染器那边会自动用透明度衰减做柔化兜底。
    if (typeof tctx.filter !== 'string') {
        return { canvas: tmp, padding: pad, width: targetW, height: targetH, blurred: false };
    }
    const out = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    const octx = out.getContext('2d');
    octx.filter = `blur(${SHADOW_BLUR_PX}px)`;
    octx.drawImage(tmp, 0, 0);
    return { canvas: out, padding: pad, width: targetW, height: targetH, blurred: true };
}

/**
 * 为"贴地阴影"类素材（比如栅栏、低矮栏杆）寻找两只"脚"的着地点。
 * 算法：找出几条又高又不透明的"立柱"，取它们底部中心点，
 * 缩放到最终显示尺寸后返回。渲染器据此画两个椭圆贴地阴影。
 */
function buildContactPoints(srcCanvas, displayW, displayH) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return [];
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const ctx = srcCanvas.getContext('2d');
    if (!ctx) return [];

    let data;
    try {
        data = ctx.getImageData(0, 0, w, h).data;
    } catch {
        return [];
    }

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 20) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < minX || maxY < minY) return [];

    const visibleH = maxY - minY + 1;
    const threshold = visibleH * 0.45;
    const runs = [];
    let runStart = -1;
    for (let x = minX; x <= maxX; x++) {
        let count = 0;
        for (let y = minY; y <= maxY; y++) {
            if (data[(y * w + x) * 4 + 3] > 20) count++;
        }
        if (count >= threshold && runStart < 0) runStart = x;
        if ((count < threshold || x === maxX) && runStart >= 0) {
            const end = count < threshold ? x - 1 : x;
            if (end - runStart >= 5) runs.push({ start: runStart, end });
            runStart = -1;
        }
    }
    if (runs.length < 2) return [];

    const postRuns = [runs[0], runs[runs.length - 1]];
    const sx = displayW / w;
    const sy = displayH / h;
    return postRuns.map(run => {
        let bottomY = minY;
        for (let y = minY; y <= maxY; y++) {
            for (let x = run.start; x <= run.end; x++) {
                if (data[(y * w + x) * 4 + 3] > 20) {
                    if (y > bottomY) bottomY = y;
                    break;
                }
            }
        }
        return {
            x: ((run.start + run.end) / 2) * sx,
            y: bottomY * sy,
        };
    });
}

export async function loadAssets(onProgress = () => {}) {
    if (_assets) return _assets;
    const out = {};
    const total = ASSET_MANIFEST.length;
    let imageCount = 0;
    let fallbackCount = 0;

    for (let i = 0; i < total; i++) {
        const entry = ASSET_MANIFEST[i];
        const meta = {
            id: entry.id,
            name: entry.name,
            category: entry.category,
            kind: entry.kind,
            footprint: entry.footprint,
            tileLike: entry.tileLike === true,
            noShadow: entry.noShadow === true,
            flatBase: entry.flatBase === true,
            shadowStyle: entry.shadowStyle ?? 'cast',
        };

        let record = null;

        if (entry.filename) {
            try {
                const img = await loadImageElement(`assets/${entry.filename}`);
                record = imageToAsset(img, entry.footprint, entry.kind, {
                    sizeScale: entry.sizeScale ?? 1,
                    tileLike:  entry.tileLike === true,
                    fitCell:   entry.fitCell === true,
                    flatBase:  entry.flatBase === true,
                });
                record.source = 'image';
                imageCount++;
            } catch {
                /* 加载 PNG 失败，下面会走程序化体素兜底 */
            }
        }

        if (!record && entry.builder) {
            const voxels = entry.builder();
            record = renderVoxels(voxels, entry.footprint);
            record.source = 'procedural';
            fallbackCount++;
        }

        if (record) {
            // 预渲染一张"显示尺寸"的中间画布，
            // 后续渲染循环里就不再每帧把多 MB 的原图重新降采样。
            record.displayCanvas = buildDisplayCanvas(
                record.canvas, record.width, record.height,
            );

            out[entry.id] = { ...meta, ...record };

            // 给需要投影的对象类素材预渲染一张柔化阴影剪影。
            // 地形类（tileLike）和"PNG 里已经自带阴影"的素材
            // 通过 manifest 配置主动跳过这一段。
            if (
                entry.kind === 'object'
                && !meta.tileLike
                && !meta.noShadow
                && record.canvas
            ) {
                const shadow = buildShadowCanvas(record.canvas, record.width, record.height);
                if (shadow) {
                    out[entry.id].shadowCanvas  = shadow.canvas;
                    out[entry.id].shadowPadding = shadow.padding;
                    out[entry.id].shadowWidth   = shadow.width;
                    out[entry.id].shadowHeight  = shadow.height;
                    out[entry.id].shadowBlurred = shadow.blurred;
                }
                if (meta.shadowStyle === 'contact') {
                    out[entry.id].contactPoints = buildContactPoints(
                        record.canvas,
                        record.width,
                        record.height,
                    );
                }
            }
        }

        onProgress((i + 1) / total, entry.name);
        // 每处理几个素材就让出一帧，给加载界面机会重绘。
        // 频率定得比"每个素材都让"宽松一点，
        // 但要保证进度条看起来仍然顺滑。
        if (i % 2 === 0) await new Promise(r => requestAnimationFrame(r));
    }

    if (fallbackCount > 0) {
        console.info(`[assets] 已加载 ${imageCount} 张图片，另有 ${fallbackCount} 个使用程序化体素兜底。`);
    } else {
        console.info(`[assets] 已加载 ${imageCount} 张图片（素材包完整）。`);
    }

    _assets = out;
    return _assets;
}

export function getAsset(id) {
    if (!_assets) throw new Error('Assets not yet loaded');
    const a = _assets[id];
    if (!a) console.warn(`Unknown asset id: ${id}`);
    return a;
}

export function allAssets() {
    if (!_assets) throw new Error('Assets not yet loaded');
    return _assets;
}
