/**
 * HUD.js
 *
 * 右下角的小卡片：时间显示 + 两个视觉开关（环境光遮蔽 / 地块边框）。
 *
 * 备注：底层的 renderer.showGrid 仍然存在，仍可通过键盘 G 快捷键或
 * Console 调用 game.toggleGrid() 来开关网格叠加层，只是不再有界面入口。
 *
 * 二次开发常见入口：
 *   - 想加新的视觉开关：复制 ao / borders 中任意一段事件绑定即可。
 *     记得在 syncToggles() 里同步初始勾选状态，并在对应的 toolbar 按钮
 *     里也补上 update() 调用，否则双向状态会跑偏。
 *   - 想改时间显示样式：改 _tick()。
 *   - 想去掉整块 HUD：在 UIManager 里不再 new HUD 即可，业务逻辑不会出错。
 */

import { playUiClick } from './Audio.js';

export class HUD {
    constructor(game) {
        this.game = game;
        this.timeEl    = document.getElementById('hud-time');
        this.aoToggle  = document.getElementById('toggle-ao');
        this.bordersToggle = document.getElementById('toggle-borders');

        this.aoToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.ambientOcclusion = this.aoToggle.checked;
            game.renderer.markDirty();
        });
        this.bordersToggle.addEventListener('change', () => {
            playUiClick();
            game.renderer.showBorders = this.bordersToggle.checked;
            game.renderer.markDirty();
            // 同步左侧工具栏"网线"按钮的高亮状态，
            // 否则只有 HUD 自己跟着变。
            game.toolbar?.update();
        });

        this._tick();
        setInterval(() => this._tick(), 30000);
    }

    _tick() {
        // Animated golden-hour clock for atmosphere.
        const d = new Date();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        if (this.timeEl) this.timeEl.textContent = `${hh}:${mm}`;
    }

    syncToggles() {
        this.aoToggle.checked      = this.game.renderer.ambientOcclusion;
        this.bordersToggle.checked = this.game.renderer.showBorders;
    }
}
