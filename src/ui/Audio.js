/**
 * Audio.js
 *
 * 项目里所有"短音效"的统一管理。每段音频只下载/解码一次，
 * 播放时新建一个临时的 AudioBufferSourceNode，让连续点击/刷涂的
 * 多次触发能自然叠播，而不是像共享 <audio> 元素那样互相打断。
 *
 * 现代浏览器要求"必须先有用户手势"才能播声音，所以这里在第一次
 * 触发时再尝试 resume AudioContext；如果还处于 suspended，就静默跳过，
 * 不会报错也不会卡住调用方。
 *
 * 二次开发常见入口：
 *   - 加新音效：在 loadUiAudio() 里 registerClip('myKey', 'xxx.ogg')，
 *     再 export 一个 play wrapper 即可。
 *   - 调整连续放置时的播放频率：改 registerClip 的 minIntervalMs。
 *   - 给某些素材换音效：在底部的 STONE_ASSET_IDS / WOOD_ASSET_IDS
 *     等集合里调整归属，或者在 playPlacementFor() 里加新分支。
 *   - 整体静音：调用 setUiAudioEnabled(false)，会影响所有 play()。
 */

const DEFAULT_VOLUME = 0.55;

let _audioCtx = null;
let _enabled = true;

// 每段音效的状态表。值的形状为：{ buffer, loading, lastPlayAt, minIntervalMs }。
const _clips = new Map();

function getCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
        _audioCtx = new Ctx();
    } catch {
        return null;
    }
    return _audioCtx;
}

/**
 * 下载 + 解码一段音效，并以 `name` 作为 key 注册到全局缓存里。
 *
 * - 多次调用同一个 name 是安全的：会复用之前的 loading Promise。
 * - 任何错误都只会打 warn，不会抛——音效文件缺失不应该影响 UI。
 * - minIntervalMs 用来防抖：相同音效在该毫秒数内的重复触发会被忽略，
 *   避免键盘连按或刷涂时音频被"机关枪"式叠播。
 */
export async function registerClip(name, url, { minIntervalMs = 18 } = {}) {
    let entry = _clips.get(name);
    if (entry?.buffer || entry?.loading) return entry.loading ?? Promise.resolve();
    if (!entry) {
        entry = { buffer: null, loading: null, lastPlayAt: 0, minIntervalMs };
        _clips.set(name, entry);
    } else {
        entry.minIntervalMs = minIntervalMs;
    }
    entry.loading = (async () => {
        const ctx = getCtx();
        if (!ctx) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.arrayBuffer();
            entry.buffer = await new Promise((resolve, reject) => {
                ctx.decodeAudioData(data, resolve, reject);
            });
        } catch (err) {
            console.warn(`[audio] failed to load clip "${name}":`, err);
        }
    })();
    return entry.loading;
}

/**
 * 触发一段已注册音效。以下情况都会静默跳过：
 *   - 音频整体被 setUiAudioEnabled(false) 关掉了；
 *   - 对应音频还没下载完；
 *   - AudioContext 仍处于 suspended（需要用户手势）。
 */
export function play(name, volume = DEFAULT_VOLUME) {
    if (!_enabled) return;
    const entry = _clips.get(name);
    if (!entry || !entry.buffer) return;
    const ctx = getCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    const now = performance.now();
    if (now - entry.lastPlayAt < entry.minIntervalMs) return;
    entry.lastPlayAt = now;

    try {
        const src = ctx.createBufferSource();
        src.buffer = entry.buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
    } catch {
        /* 音频失败不应中断游戏流程，直接吞掉 */
    }
}

/* ── 项目内置音效的快捷封装 ─────────────────────────────────────── */

export async function loadUiAudio() {
    // 一共注册 7 段音效，按用途分别是：
    //   ui              ：菜单/工具栏/素材面板/快捷键通用的轻"咔"声；
    //   placement       ：未匹配到具体材质时的通用放置/移除"咚"声；
    //   placementWater  ：放置或擦除水面瓦片时的水花声；
    //   placementStone  ：石头/砖/白墙等建筑类的厚重敲击声；
    //   placementWood   ：木栅栏、木质装饰、桥等的轻木敲声；
    //   placementVeg    ：小型植被（草地/龙舌兰/花盆等）的沙沙声；
    //   placementTree   ：大型乔木（柏树/橄榄/三角梅）的树叶簌簌声。
    // 全部并行下载，互不阻塞。
    await Promise.all([
        registerClip('ui',                'menu_select_lightbulb.ogg',   { minIntervalMs: 18 }),
        // 刷涂时同一种音效会被密集触发，比 UI 点击稍微节流多一点，
        // 既保留叠播的层次感，又避免一瞬间糊成一团。
        registerClip('placement',         'new-placement.ogg',            { minIntervalMs: 35 }),
        registerClip('placementWater',    'waterPlacement.ogg',           { minIntervalMs: 50 }),
        registerClip('placementStone',    'brick-stone.ogg',              { minIntervalMs: 35 }),
        registerClip('placementWood',     'fence-woodenDecorations.ogg',  { minIntervalMs: 35 }),
        registerClip('placementVeg',      'small-vegetations.ogg',        { minIntervalMs: 30 }),
        registerClip('placementTree',     'large-vegetations.ogg',        { minIntervalMs: 40 }),
    ]);
}

export function playUiClick(volume = DEFAULT_VOLUME)   { play('ui',             volume); }
export function playPlacement(volume = 0.6)            { play('placement',      volume); }
export function playWaterPlacement(volume = 0.6)       { play('placementWater', volume); }
export function playStonePlacement(volume = 0.6)       { play('placementStone', volume); }
export function playWoodPlacement(volume = 0.6)        { play('placementWood',  volume); }
export function playVegPlacement(volume = 0.6)         { play('placementVeg',   volume); }
export function playTreePlacement(volume = 0.6)        { play('placementTree',  volume); }

/**
 * 放置/擦除时使用"石头敲击"音效的素材 id 集合。
 * 包括明显的石头类地形和道具，以及外表是粉刷白墙、
 * 本质上是砖石结构的 Mykonos 建筑。
 *
 * 用 Set 是为了在 playPlacementFor 里做 O(1) 的归属判断。
 */
const STONE_ASSET_IDS = new Set([
    // 地形
    'stone', 'path', 'sea_wall', 'stairs',
    // 墙体/拱门/灯/盆
    'low_wall', 'corner_wall', 'archway',
    'stone_lantern', 'stone_basin', 'well',
    // 散落石块
    'rocks', 'large_rock', 'mossy_stone', 'flat_stone',
    'pebbles', 'stone_pile', 'boulder',
    // 建筑（粉刷的砖石结构）
    'house', 'two_story', 'cube_house', 'terrace_house', 'pergola_house',
    'villa', 'altar', 'tower_chapel', 'main_chapel', 'windmill',
]);

/**
 * 放置/擦除时使用"木质"音效的素材 id 集合：
 * 木栅栏、木栏杆、木家具、灯柱、木质搬运物以及水景里的木结构。
 */
const WOOD_ASSET_IDS = new Set([
    // 栅栏 / 栏杆 / 门
    'blue_railing', 'gate_fence',
    // 木家具 / 标牌
    'bench', 'signpost', 'banner',
    // 灯柱（木杆）
    'lantern_post', 'hanging_lantern',
    // 木质可搬运物
    'crate', 'hay_bale', 'storage_box', 'wood_pile', 'water_bucket',
    // 水景里的木结构
    'small_bridge', 'garden_bed', 'crop_patch', 'veg_garden',
]);

/**
 * 放置/擦除时使用"小型植被沙沙声"的素材 id 集合：
 * 草地地形 + 低矮植物道具（多肉、干草、花盆等）。
 */
const SMALL_VEG_ASSET_IDS = new Set([
    'grass',
    'agave', 'dry_grass', 'flower_pot', 'terracotta_pot',
]);

/**
 * 放置/擦除时使用"大型植被簌簌声"的素材 id 集合：
 * 仅留给完整树木和高大开花植物。
 */
const LARGE_VEG_ASSET_IDS = new Set([
    'cypress', 'olive', 'bougainvillea',
]);

/**
 * 按素材 id 选择对应的放置/擦除音效：
 *   - 水面瓦片       → 水花声
 *   - 石头/砖石       → 厚重敲击
 *   - 栅栏/木质       → 木质敲击
 *   - 小型植被       → 沙沙声
 *   - 大型乔木       → 树叶簌簌声
 *   - 其他           → 通用放置"咚"声
 *
 * 把这套映射集中在这里，调用方就不用了解素材归属规则。
 */
export function playPlacementFor(assetId) {
    if (assetId === 'water') {
        playWaterPlacement();
        return;
    }
    if (STONE_ASSET_IDS.has(assetId)) {
        playStonePlacement();
        return;
    }
    if (WOOD_ASSET_IDS.has(assetId)) {
        playWoodPlacement();
        return;
    }
    if (SMALL_VEG_ASSET_IDS.has(assetId)) {
        playVegPlacement();
        return;
    }
    if (LARGE_VEG_ASSET_IDS.has(assetId)) {
        playTreePlacement();
        return;
    }
    playPlacement();
}

export function setUiAudioEnabled(on) { _enabled = !!on; }
export function isUiAudioEnabled() { return _enabled; }
