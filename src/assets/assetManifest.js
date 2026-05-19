/**
 * assetManifest.js
 *
 * 游戏内所有素材配置的来源。每一项会绑定：
 *   - id / name：素材 id 和素材栏里显示的名称。
 *   - category：素材分类，可选 terrain、nature、props、water、buildings。
 *   - footprint：占地大小 { w, d }，单位是网格格子，会直接影响能否放置和占用检测。
 *   - kind：terrain 表示替换地面格；object 表示放在地面上的模型。
 *   - filename：实际加载的图片文件，默认位于 /assets/。
 *   - sizeScale：视觉显示比例，控制素材看起来占单格宽度的多少。
 *                它和 footprint 是分开的：小罐子可以占 1x1 格，但画面上只显示很小。
 *   - noShadow：PNG 已经自带底座/阴影时，跳过渲染器投射阴影。
 *   - fitCell：高分辨率 object 图片按单格宽度缩放，不再重新压进低分辨率地形瓦片。
 *   - flatBase：图片底部没有画地台/厚度，底边就是模型脚底；渲染时锚到格子前角。
 *   - shadowStyle：cast 为默认投影；contact 为低矮道具绘制贴地的小阴影。
 *   - builder：PNG 缺失时使用的程序化体素兜底，方便开发时素材不全也能运行。
 *
 * 二次开发更换素材时，优先看这个文件：
 *   1. id 会对应 assets/ 下的图片文件名，例如 grass -> assets/grass.png。
 *   2. name 是素材栏里显示给玩家看的中文名称。
 *   3. footprint / sizeScale 控制素材占几格、显示多大；只换图通常不用改。
 *   4. 如果图片缺失，builder 会用 assetDefinitions.js 里的体素版本兜底。
 */

import * as A from './assetDefinitions.js';

const T = (id, name, foot = { w: 1, d: 1 }) => ({
    id, name, category: 'terrain', footprint: foot, kind: 'terrain',
    filename: `${id}.png`, sizeScale: 1,
});
const O = (category, defaultScale = 1) =>
    (id, name, foot = { w: 1, d: 1 }, sizeScale = defaultScale) => ({
        id, name, category, footprint: foot, kind: 'object',
        filename: `${id}.png`, sizeScale,
    });
const N = O('nature', 0.85);
const P = O('props',  0.5);
const W = O('water',  0.85);
const B = O('buildings', 1);
const TO = O('terrain', 1);

export const ASSET_MANIFEST = [
    // ── 地形：通常替换单个地面格 ───────────────────────────────
    { ...T('grass',    '草地'),     tileLike: true, builder: A.tileGrass }, 
    { ...T('path',     '石路'),     tileLike: true, builder: A.tileStonePath },
    { ...T('sand',     '沙地'),     tileLike: true, builder: A.tileSand },
    { ...T('stone',    '白石地面'), tileLike: true, builder: A.tileWhiteStone },
    { ...T('water',    '水面'),     tileLike: true, builder: A.tileWater },
    { ...TO('stairs',   '台阶'),    noShadow: true, builder: A.tileStairs },
    { ...TO('sea_wall', '海堤', { w: 1, d: 1 }, 0.70), fitCell: true, flatBase: true, noShadow: true, builder: A.tileSeaWall },

    // ── 自然：树木、植被等 object 模型 ─────────────────────────
    { ...N('cypress',       '柏树',       { w: 1, d: 1 }, 0.65), builder: A.cypressCluster },
    { ...N('bougainvillea', '三角梅',     { w: 1, d: 1 }, 0.80), builder: A.bougainvilleaTree },
    { ...N('olive',         '橄榄树',     { w: 1, d: 1 }, 0.90), builder: A.oliveTree },
    { ...N('agave',         '龙舌兰',     { w: 1, d: 1 }, 0.60), builder: A.agavePlant },
    { ...N('dry_grass',     '干草丛',     { w: 1, d: 1 }, 0.55), builder: A.dryGrassTuft },
    { ...N('flower_pot',    '花盆',       { w: 1, d: 1 }, 0.35), builder: A.flowerPot },

    // ── 道具：墙、栏杆、家具、小物件等 ───────────────────────────
    // 墙体、栏杆、门、拱门需要和相邻格对齐，所以视觉上通常接近占满一格。
    { ...P('low_wall',        '矮墙',        { w: 1, d: 1 }, 1.00), builder: A.lowWhiteWall },
    { ...P('blue_railing',    '蓝色栏杆',    { w: 1, d: 1 }, 0.65), flatBase: true, shadowStyle: 'contact', builder: A.blueRailing },
    { ...P('corner_wall',     '转角墙',      { w: 1, d: 1 }, 1.00), builder: A.cornerWall },
    { ...P('gate_fence',      '木门栅栏',    { w: 1, d: 1 }, 0.70), flatBase: true, shadowStyle: 'contact', builder: A.woodenGateFence },
    { ...P('archway',         '拱门',        { w: 1, d: 1 }, 0.90), builder: A.whiteArchway },

    // 灯柱类是细长竖向物体，footprint 仍是 1x1，但 sizeScale 会压小到半格左右。
    { ...P('lantern_post',    '灯柱',        { w: 1, d: 1 }, 0.45), builder: A.lanternPost },
    { ...P('stone_lantern',   '石灯',        { w: 1, d: 1 }, 0.40), builder: A.stoneLantern },
    { ...P('hanging_lantern', '吊灯',        { w: 1, d: 1 }, 0.40), builder: A.hangingLantern },

    // 家具/可交互结构比小物件更厚重，但视觉上不一定占满整格。
    { ...P('bench',           '长椅',        { w: 1, d: 1 }, 0.50), builder: A.blueBench },
    { ...P('signpost',        '路牌',        { w: 1, d: 1 }, 0.40), builder: A.signpost },
    { ...P('banner',          '旗帜',        { w: 1, d: 1 }, 0.45), builder: A.bannerFlag },

    // 可搬动装饰物：整体偏小。
    { ...P('crate',           '木箱',        { w: 1, d: 1 }, 0.50), builder: A.woodenCrate },
    { ...P('hay_bale',        '干草捆',      { w: 1, d: 1 }, 0.55), builder: A.hayBale },
    { ...P('storage_box',     '储物箱',      { w: 1, d: 1 }, 0.55), builder: A.storageBox },
    { ...P('wood_pile',       '木柴堆',      { w: 1, d: 1 }, 0.55), builder: A.woodPile },
    { ...P('water_bucket',    '水桶',        { w: 1, d: 1 }, 0.35), builder: A.waterBucket },
    { ...P('pottery_jar',     '陶罐',        { w: 1, d: 1 }, 0.35), builder: A.potteryJar },
    { ...P('terracotta_pot',  '陶土花盆',    { w: 1, d: 1 }, 0.30), builder: A.terracottaPot },
    { ...P('stone_basin',     '石盆',        { w: 1, d: 1 }, 0.50), builder: A.stoneBasin },

    // 石头杂物：小型、零散，用于填充细节。
    { ...P('rocks',           '石块',        { w: 1, d: 1 }, 0.55), builder: A.rockCluster },
    { ...P('large_rock',      '大石头',      { w: 1, d: 1 }, 0.65), builder: A.largeRock },
    { ...P('mossy_stone',     '苔藓石',      { w: 1, d: 1 }, 0.45), builder: A.mossyStone },
    { ...P('flat_stone',      '扁石',        { w: 1, d: 1 }, 0.45), builder: A.flatStone },
    { ...P('pebbles',         '鹅卵石',      { w: 1, d: 1 }, 0.45), builder: A.pebbles },
    { ...P('stone_pile',      '石堆',        { w: 1, d: 1 }, 0.55), builder: A.stonePile },
    { ...P('boulder',         '巨石',        { w: 1, d: 1 }, 0.75), builder: A.boulder },

    // ── 水景：桥、水井、花圃、菜地等 ───────────────────────────
    { ...W('small_bridge', '小桥',       { w: 2, d: 1 }, 0.95), builder: A.smallBridge },
    { ...W('well',         '水井',       { w: 1, d: 1 }, 0.55), builder: A.well },
    // 花圃和作物地块的 PNG 已经画好了箱体/地台厚度。
    // 保持原图完整，并把底边锚到格子前角，让它们贴在高亮格子上而不是浮在上方。
    { ...W('garden_bed',   '花圃',       { w: 1, d: 1 }, 0.95), filename: 'newAsset/Garden Bed.png', fitCell: true, flatBase: true, noShadow: true, builder: A.plantedGardenBed },
    { ...W('crop_patch',   '作物地块',   { w: 1, d: 1 }, 0.95), filename: 'newAsset/Crop Patch.png', fitCell: true, flatBase: true, noShadow: true, builder: A.cropPatch },
    { ...W('veg_garden',   '菜园',       { w: 1, d: 1 }, 0.95), filename: 'newAsset/Veg Garden.png', fitCell: true, flatBase: true, noShadow: true, builder: A.vegetableGarden },

    // ── 建筑：通常 footprint 更大，会占用多个格子 ───────────────
    { ...B('house',         '小屋',       { w: 2, d: 2 }), builder: A.smallMykonosHouse },
    { ...B('two_story',     '二层小楼',   { w: 3, d: 3 }), builder: A.twoStoryHouse },
    { ...B('cube_house',    '方块屋',     { w: 2, d: 2 }), builder: A.whiteCubeHouse },
    { ...B('terrace_house', '露台房屋',   { w: 3, d: 2 }), builder: A.terraceHouse },
    { ...B('pergola_house', '凉棚房屋',   { w: 3, d: 3 }), builder: A.pergolaHouse },
    { ...B('villa',         '主别墅',     { w: 4, d: 4 }), builder: A.mainVilla },
    { ...B('altar',         '小祭坛',     { w: 2, d: 2 }), builder: A.smallChapelAltar },
    { ...B('tower_chapel',  '塔楼礼拜堂', { w: 2, d: 2 }), builder: A.towerChapel },
    { ...B('main_chapel',   '主礼拜堂',   { w: 3, d: 3 }), builder: A.mainChapel },
    { ...B('windmill',      '风车',       { w: 2, d: 2 }), builder: A.windmillBuilding },
];

export const ASSET_INDEX = Object.freeze(
    ASSET_MANIFEST.reduce((acc, a) => { acc[a.id] = a; return acc; }, {})
);

export const CATEGORIES = ['terrain', 'nature', 'props', 'water', 'buildings'];

export const CATEGORY_LABELS = {
    terrain: '地形',
    nature: '自然',
    props: '道具',
    water: '水景',
    buildings: '建筑',
};
