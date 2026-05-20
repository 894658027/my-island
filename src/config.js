/**
 * 全局配置。
 *
 * 整套项目里和"尺寸 / 颜色 / 调参"相关的常量都集中在这里，
 * 其余代码只用「格子」「瓦片」等抽象概念，像素细节由这一份文件统一管控。
 *
 * 二次开发常见入口：
 *   - 想放大/缩小地图：改 grid.width / grid.height。
 *   - 想换瓦片像素尺寸（影响整体清晰度和性能）：改 tile.w / tile.h。
 *   - 想改相机缩放范围或默认视角：改 camera 三项。
 *   - 想替换整套配色（仅影响程序化体素兜底渲染）：改 palette。
 *   - 想改 localStorage 存档键（清空玩家旧档时用得到）：改 storageKey。
 */

export const CONFIG = Object.freeze({
    grid: {
        width: 14,
        height: 14,
    },

    // 一个 tile 即等距网格里的一格地面菱形。
    // 经典 2:1 等距比例，宽 64px × 高 32px。改这两个值会让整张地图
    // 视觉同步放大/缩小，但同时也会影响素材的清晰度和性能。
    tile: {
        w: 64,
        h: 32,
    },

    // 每个 tile 在体素兜底渲染时被分成 4×4 个体素。
    // 也就是单个体素方块的顶面是 16×16 像素，垂直高度也是 16 像素，
    // 用来保证程序化生成的素材足够"块感"、不发糊。
    voxel: {
        perTile: 4,        // 每个 tile 的边对应的体素数
        size: 16,          // 体素顶面在屏幕上的宽度（像素）
        height: 16,        // 体素垂直高度（像素）
    },

    // 相机缩放限制。minZoom 越小看得越远，maxZoom 越大放得越近。
    camera: {
        minZoom: 0.5,
        maxZoom: 3.0,
        defaultZoom: 1.4,
    },

    // 场景内部深度排序的层级常量；目前只在少量逻辑里参考。
    layers: Object.freeze({
        TERRAIN: 0,
        WATER:   1,
        OBJECT:  2,
    }),

    // localStorage 存档键。改这里相当于"作废所有玩家旧档"，
    // 适合存档结构有破坏性变化时用版本号递增（save.v2、save.v3 …）。
    storageKey: 'mykonos-island-voxels.save.v1',

    // 地中海明亮配色表，主要被 assetDefinitions.js 里的程序化兜底素材使用。
    // 真正显示的素材以 assets/ 下的 PNG 为准，所以改这里只影响"图片缺失时"
    // 的占位画面。
    palette: Object.freeze({
        // 白色系
        white:        '#fafaf5',
        whiteShadow:  '#e6e2d3',
        whiteDeep:    '#cfc9b7',

        // 钴蓝系
        cobalt:       '#1b5ba8',
        cobaltLight:  '#2e6fbc',
        cobaltDeep:   '#134680',
        skyBlue:      '#4287d5',

        // 地形相关
        grass:        '#7eaa5f',
        grassDark:    '#5c8a44',
        grassLight:   '#9bc377',
        sand:         '#e8d4a8',
        sandDark:     '#c9b084',
        path:         '#c4b49c',
        pathDark:     '#a89878',
        pathLight:    '#d6c8b0',
        sea:          '#6ec8e0',
        seaDeep:      '#4da8c4',
        seaShine:     '#a8e0ee',
        seaWall:      '#ddd3c4',

        // 植被
        cypress:      '#3d7355',
        cypressDark:  '#28533a',
        cypressLight: '#5a8d6e',
        olive:        '#7a9460',
        oliveDark:    '#5a7448',
        oliveLight:   '#9bb37e',
        leaf:         '#4a7a3e',
        leafDark:     '#2f5527',
        bougain:      '#d85b8e',
        bougainDark:  '#b03a6a',
        bougainLight: '#ee84ad',
        agave:        '#a4b87a',
        agaveDark:    '#7a8e54',
        dryGrass:     '#cdb874',

        // 木质 / 土陶
        wood:         '#a07344',
        woodDark:     '#704c27',
        woodLight:    '#bd8e5b',
        terracotta:   '#c4622e',
        terraLight:   '#dc7d44',
        terraDark:    '#9a4720',
        roof:         '#bb6b3f',
        roofDark:     '#8b4825',

        // 石材 / 金属
        stone:        '#b5b0a2',
        stoneDark:    '#8d8878',
        stoneLight:   '#cdc8b8',
        iron:         '#3a3833',
        ironLight:    '#5a5750',
        gold:         '#e5c065',

        // 其它装饰用色
        flower:       '#e16ea6',
        flowerYellow: '#f4d168',
        flowerWhite:  '#fff8e6',
        soil:         '#7a5a3c',
        soilDark:     '#5a3f25',
        crop:         '#9bc377',
        cropDark:     '#6b8e3e',
        glass:        '#eef4f7',
        flame:        '#ffc24a',
    }),
});
