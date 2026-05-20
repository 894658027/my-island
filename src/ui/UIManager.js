/**
 * UIManager.js
 *
 * 把所有基于 DOM 的 UI 子系统（工具栏 Toolbar、素材面板 AssetPalette、
 * 右下角 HUD 等）组装成一个统一入口，并负责底部 Toast 提示。
 *
 * 二次开发常见入口：
 *   - 想加一个新面板：在构造函数里 new 你的面板类，挂上对应的 DOM 节点，
 *     并按需要在 update() 里调用它的刷新方法。
 *   - 想改 Toast 默认停留时长：改 showToast(text, ms = 1600) 的默认值。
 *   - 想统一加 UI 音效：和这里 ins.addEventListener('toggle', ...) 类似，
 *     直接在事件回调里 playUiClick() 就行。
 */

import { Toolbar } from './Toolbar.js';
import { AssetPalette } from './AssetPalette.js';
import { HUD } from './HUD.js';
import { playUiClick } from './Audio.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.toolbar = new Toolbar(document.getElementById('toolbar'), game);
        this.palette = new AssetPalette(
            document.getElementById('palette-tabs'),
            document.getElementById('palette-grid'),
            game,
        );
        this.hud = new HUD(game);
        this.toast = document.getElementById('toast');

        // 左下角的"操作说明"是浏览器原生 <details>；
        // 在它展开/折叠时给一个 UI 点击音，体感与工具栏 / 素材面板 / HUD 一致。
        const ins = document.getElementById('instructions');
        if (ins) {
            ins.addEventListener('toggle', () => playUiClick());
        }

        // 把各个子系统挂回 game，方便 Game / 其他模块从中央位置直接拿到。
        game.toolbar = this.toolbar;
        game.palette = this.palette;
        game.hud = this.hud;
    }

    update() {
        this.toolbar.update();
        this.palette.update();
    }

    showToast(text, ms = 1600) {
        this.toast.textContent = text;
        this.toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('show');
        }, ms);
    }
}
