/**
 * main.js
 *
 * 项目的程序入口。浏览器加载页面后第一个执行的就是这里。
 *
 * 整体流程：
 *   1. 先调用 loadAssets() 把 assets/ 下的 PNG 素材按 assetManifest 的
 *      配置全部加载、裁剪、缓存好；同时驱动加载界面的进度条更新。
 *   2. 并行触发 loadUiAudio() 预下载 UI 音效，避免用户第一次点击时
 *      还要等音频文件。
 *   3. 素材准备好之后再创建 Game / UIManager，把整套世界状态搭起来。
 *   4. 优先从 localStorage 恢复上次的存档；没有存档则播放初始场景动画。
 *   5. 隐藏加载界面、显示主画面。
 *
 * 二次开发备注：
 *   - 想换素材：通常只需替换 assets/ 下同名 PNG，本文件不用改。
 *   - 想加全局调试入口：可以在已有的 `window.game = game` 一行附近
 *     再挂别的对象/方法。
 *   - 想跳过初始演示场景：把 seedExampleVillage 那一段改掉即可。
 */

import { loadAssets } from './assets/assetLoader.js';
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { loadUiAudio } from './ui/Audio.js';

async function main() {
    const fill = document.getElementById('loading-fill');
    const status = document.getElementById('loading-status');
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');

    await loadAssets((p, label) => {
        fill.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `正在制作 ${label}…`;
    });

    // 并行预下载 UI 音效。文件很小，提前拉好可以避免用户第一次
    // 点击工具栏时还要等几十到几百毫秒才听到声音。
    loadUiAudio();

    fill.style.width = '100%';
    status.textContent = '正在进入小岛';

    // 让进度条扫完最后一段；纯观感上的小停顿，去掉也不会出错。
    await new Promise(r => setTimeout(r, 250));

    const canvas = document.getElementById('game-canvas');
    const game = new Game(canvas);
    const ui = new UIManager(game);
    game.ui = ui;
    ui.update();
    // 方便在浏览器 Console 里调用 game.test() 等调试方法。
    if (typeof window !== 'undefined') window.game = game;

    // 优先恢复上次的存档；没有存档（首次访问 / 用户重置过）
    // 才铺一个初始场景动画。
    if (game.load()) {
        ui.showToast('欢迎回来');
    } else {
        seedExampleVillage(game);
    }

    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');
    // game.test();  // 取消注释即可在进入页面后自动执行测试代码
}

/**
 * 初始演示场景：首次进入页面（没有存档）时使用，让用户上来就看到
 * 一个漂亮的小岛，而不是一张空地图。
 *
 * 所有素材都通过 placeAndAnimate 排进同一条动画队列，并按"格子越靠
 * 后越早出现"的延迟规则错峰播放：
 *   - 最后排的草地先冒出来；
 *   - 这道波纹沿对角线向前推进，依次铺满整张地图；
 *   - 建筑 / 道具会在自己所在那格草地落定后再"弹"进来。
 * 整段铺陈大约持续 1 秒出头。
 */
function seedExampleVillage(game) {
    const W = game.tileMap.width, H = game.tileMap.height;

    // 动画节奏参数。
    //   STEP_MS：波纹每向前推一行所花的毫秒数，越小越紧凑。
    //   OBJECT_DELAY：建筑 / 道具相对所在格地形的额外延迟，
    //                 让它们在草地落定后再出现，避免与地形动画撞在一起。
    const STEP_MS      = 32;
    const OBJECT_DELAY = 90;

    const placeT = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS;
        game.placeAndAnimate(id, gx, gy, { delay });
    };
    const placeO = (id, gx, gy) => {
        const delay = (gx + gy) * STEP_MS + OBJECT_DELAY;
        game.placeAndAnimate(id, gx, gy, { delay });
    };

    // 整张地图先铺一层草地作为基底。
    for (let gy = 0; gy < H; gy++)
    for (let gx = 0; gx < W; gx++) {
        placeT('grass', gx, gy);
    }

    // 中间一条十字石路，分割出村庄的主轴线。
    const midX = Math.floor(W / 2);
    const midY = Math.floor(H / 2);
    for (let gx = 1; gx < W - 1; gx++) placeT('path', gx, midY);
    for (let gy = 1; gy < H - 1; gy++) placeT('path', midX, gy);

    // 地图最前方两排做成水面，作为环岛海域。
    for (let gx = 0; gx < W; gx++) {
        placeT('water', gx, H - 1);
        placeT('water', gx, H - 2);
    }
    // 紧贴水面的一条沙地，作为海岸线 / 沙滩过渡。
    for (let gx = 0; gx < W; gx++) placeT('sand', gx, H - 3);

    // 几座标志性建筑：小屋、礼拜堂、风车、二层小楼、别墅。
    placeO('house', 2, 2);
    placeO('main_chapel', 7, 1);
    placeO('windmill', 11, 2);
    placeO('two_story', 2, 7);
    placeO('villa', 7, 7);

    // 自然装饰：柏树、三角梅、橄榄树、花盆、龙舌兰等。
    placeO('cypress', 1, 5);
    placeO('cypress', 12, 5);
    placeO('bougainvillea', 5, 3);
    placeO('olive', 0, 9);
    placeO('flower_pot', 6, 5);
    placeO('terracotta_pot', 11, 6);
    placeO('agave', 13, 8);

    // 灯柱与水边的小桥。
    placeO('lantern_post', 4, 6);
    placeO('lantern_post', 9, 6);
    placeO('small_bridge', 5, H - 2);
}

// 启动入口；任何加载阶段出错都把信息显示在加载界面上，
// 方便用户/开发者直接看到原因（而不是停在转圈状态）。
main().catch(err => {
    console.error(err);
    document.getElementById('loading-status').textContent =
        `出错了：${err.message}`;
});
