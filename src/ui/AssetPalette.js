/**
 * AssetPalette.js
 *
 * 右侧素材面板：上面一排"分类标签"，下面是当前分类下的素材方块网格。
 * 每个方块直接展示加载后的素材图，让玩家所见即所得。
 *
 * 数据来源：分类、素材名、id 都从 assetManifest.js 读取。
 *
 * 二次开发常见入口：
 *   - 换素材图：只需替换 assets/ 下同名 PNG，本文件不用动。
 *   - 改素材中文名 / 占地：直接改 assetManifest.js。
 *   - 想改方块尺寸或缩略图清晰度：调整 _renderGrid() 里的 max = 56
 *     这个上限，以及 styles.css 里 .swatch 的 width / height。
 *   - 想加搜索框 / 收藏夹之类：在 _renderGrid() 渲染之前过滤一下
 *     ASSET_MANIFEST 即可。
 */

import { ASSET_MANIFEST, CATEGORIES, CATEGORY_LABELS } from '../assets/assetManifest.js';
import { allAssets } from '../assets/assetLoader.js';
import { playUiClick } from './Audio.js';

export class AssetPalette {
    constructor(tabsEl, gridEl, game) {
        this.tabsEl = tabsEl;
        this.gridEl = gridEl;
        this.game = game;
        this.tabButtons = new Map();
        this._buildTabs();
        this._renderGrid();
    }

    _buildTabs() {
        this.tabsEl.innerHTML = '';
        for (const c of CATEGORIES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            // 想显示英文分类名时可以恢复下面这行；
            // 当前用 CATEGORY_LABELS 提供的中文标签。
            // btn.textContent = c[0].toUpperCase() + c.slice(1);
            btn.textContent = CATEGORY_LABELS[c] ?? c;
            btn.addEventListener('click', () => {
                playUiClick();
                this.game.setCategory(c);
            });
            this.tabsEl.appendChild(btn);
            this.tabButtons.set(c, btn);
        }
        this.update();
    }

    _renderGrid() {
        this.gridEl.innerHTML = '';
        const generated = allAssets();
        const items = ASSET_MANIFEST.filter(a => a.category === this.game.category);
        for (const def of items) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'swatch';
            swatch.dataset.assetId = def.id;

            // 这里拿到的 gen 是已经加载/裁切好的素材画布，按钮里显示的是缩略图。
            const gen = generated[def.id];
            if (gen) {
                const img = document.createElement('canvas');
                const max = 56;
                const scale = Math.min(max / gen.width, max / gen.height, 2);
                img.width  = Math.ceil(gen.width  * scale);
                img.height = Math.ceil(gen.height * scale);
                const ctx = img.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(gen.canvas, 0, 0, img.width, img.height);
                swatch.appendChild(img);
            }

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = def.name;
            swatch.appendChild(name);

            swatch.addEventListener('click', () => {
                playUiClick();
                this.game.selectAsset(def.id);
            });
            this.gridEl.appendChild(swatch);
        }
        this.update();
    }

    update() {
        for (const [c, btn] of this.tabButtons) {
            btn.classList.toggle('active', c === this.game.category);
        }
        // 仅在"当前显示的素材集合"和"应该显示的集合"不一致时才整体重渲，
        // 避免每次选择素材都重新生成所有 DOM（性能 + 滚动位置都更稳）。
        const visibleIds = Array.from(this.gridEl.querySelectorAll('.swatch'))
            .map(el => el.dataset.assetId);
        const expectedIds = ASSET_MANIFEST
            .filter(a => a.category === this.game.category)
            .map(a => a.id);
        const sameSet = visibleIds.length === expectedIds.length
            && visibleIds.every((id, i) => id === expectedIds[i]);
        if (!sameSet) this._renderGrid();

        for (const sw of this.gridEl.querySelectorAll('.swatch')) {
            sw.classList.toggle('selected', sw.dataset.assetId === this.game.selectedAssetId);
        }
    }
}
