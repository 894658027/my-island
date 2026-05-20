/**
 * Toolbar.js
 *
 * 渲染左侧那条竖向工具栏。每个按钮的图标都是用 Canvas 现画的小图
 * （不依赖外部图标字体），风格统一沿用项目的卡通插画感。
 *
 * 二次开发常见入口：
 *   - 加新按钮：往 TOOL_BUTTONS 数组里加一项 { id, label }，
 *     然后在 TOOL_ICONS 里写一个对应的 drawXxxIcon 函数，
 *     最后在 _onClick() 的 switch 里加上对应的行为。
 *   - 调按钮顺序：直接调整 TOOL_BUTTONS 的数组顺序。
 *   - 改某个按钮的图标：找到 drawXxxIcon 改画法即可。
 *   - 改按钮高亮规则（active 类）：改 update() 里的判定逻辑。
 */

import { playUiClick } from './Audio.js';

const TOOL_ICONS = {
    place: drawPlaceIcon,
    fill:  drawFillIcon,
    erase: drawEraseIcon,
    pan:   drawPanIcon,
    grid:  drawGridIcon,
    save:  drawSaveIcon,
    reset: drawResetIcon,
}; 

const TOOL_BUTTONS = [
    { id: 'place',  label: '放置' },
    { id: 'fill',   label: '铺满' },
    { id: 'erase',  label: '擦除' },
    { id: 'pan',    label: '平移' },
    { id: 'grid',   label: '边框' },
    { id: 'save',   label: '保存' },
    { id: 'reset',  label: '重置' },
];

export class Toolbar {
    constructor(rootEl, game) {
        this.root = rootEl;
        this.game = game;
        this.buttons = new Map();
        this._build();
    }

    _build() {
        this.root.innerHTML = '';
        // 每个图标绘制函数都假设画在 44×44 的"逻辑坐标系"里、中心是 (22, 22)。
        // 实际给 canvas 分配的像素是 44 × dprFactor，这样在高分辨率屏幕
        // （比如 3× 的 iPhone Retina）上不会被浏览器再放大一遍而发糊。
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const dprFactor = Math.max(1, Math.min(3, Math.ceil(dpr)));
        const backing = 44 * dprFactor;
        for (const def of TOOL_BUTTONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tool';
            btn.dataset.toolId = def.id;
            const cv = document.createElement('canvas');
            cv.className = 'ti';
            cv.width = backing;
            cv.height = backing;
            const ctx = cv.getContext('2d');
            // 预先按 dprFactor 缩放，这样后续 drawXxxIcon 里都可以
            // 用 44×44 的逻辑坐标作画，不用关心实际像素密度。
            if (dprFactor !== 1) ctx.scale(dprFactor, dprFactor);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const drawer = TOOL_ICONS[def.id];
            if (drawer) drawer(ctx);
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = def.label;
            btn.appendChild(cv);
            btn.appendChild(label);
            btn.addEventListener('click', () => this._onClick(def.id));
            this.root.appendChild(btn);
            this.buttons.set(def.id, btn);
        }
        this.update();
    }

    _onClick(id) {
        playUiClick();
        switch (id) {
            case 'place': this.game.setTool('place'); break;
            case 'erase': this.game.setTool('erase'); break;
            case 'pan':   this.game.setTool('pan');   break;
            case 'grid':  this.game.toggleBorders();  break;
            case 'save':  this.game.save();           break;
            case 'reset': this.game.reset();          break;
            case 'fill':  this.game.fillGrass();      break;
        }
    }

    update() {
        const tool = this.game.tool;
        // "网线"按钮高亮规则：和右下 HUD 的"边框"复选框保持同一种语义——
        // 「亮起 / 勾上」都表示「线当前是可见的」（showBorders === true）。
        // 这样两边视觉同步，避免一边亮一边灭的违和感。
        const bordersOn = this.game.renderer.showBorders;
        for (const [id, btn] of this.buttons) {
            btn.classList.toggle('active',
                (id === 'place' && tool === 'place')
             || (id === 'erase' && tool === 'erase')
             || (id === 'pan'   && tool === 'pan')
             || (id === 'grid'  && bordersOn)
            );
        }
    }
}

/* ── 工具按钮图标 ────────────────────────────────────────────────
 *
 * 每个图标各自画在自己的 44×44 画布上、中心 (22, 22)，并尽量使用
 * 玩家一眼能看懂的视觉隐喻，即使不看下方文字也能猜到工具的功能：
 *
 *   place → 地图大头钉（Google Maps 那种"在这里放置"）
 *   fill  → 油漆桶（桶里装着绿色油漆，呼应"铺草地"的含义）
 *   erase → 经典铅笔橡皮（粉色橡皮头 + 金属箍 + 笔身）
 *   pan   → 上下左右四向箭头（Figma / Photoshop 的"移动"图标）
 *   grid  → 3×3 网格（即"网线/边框"按钮）
 *   save  → 软盘（顶部金属推杆 + 下方标签区）
 *   reset → 弧形循环箭头（刷新 / 重来）
 *
 * 所有图标都用统一的钴蓝色（INK 常量），形成视觉上的一致感。
 */

const INK       = '#1b5ba8';
const INK_DARK  = '#134680';
const PAPER     = '#fafaf5';
const GRASS     = '#7eaa5f';
const GRASS_DK  = '#5c8a44';
const ERASER_PINK = '#e89a9a';

function drawPlaceIcon(ctx) {
    // 地图大头钉：泪滴形外轮廓 + 中央镂空小圆，
    // 是地图类应用里"在这里放置"通用的视觉符号。
    ctx.save();
    ctx.translate(22, 22);

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, 14);                              // 钉尖朝下
    ctx.bezierCurveTo(-10, 4, -10, -10, 0, -10);
    ctx.bezierCurveTo(10, -10, 10, 4, 0, 14);
    ctx.closePath();
    ctx.fill();

    // 中间的小圆挖空，让它看起来像钉子而不是气球。
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, -3, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawFillIcon(ctx) {
    // 油漆桶里盛着绿色油漆——把"填充"的通用符号
    // 和"铺草地"的颜色含义结合在一起。
    ctx.save();
    ctx.translate(22, 22);

    // 桶身：上口稍宽于桶底，类似真实的油漆桶。
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(9, -3);
    ctx.lineTo(7, 11);
    ctx.lineTo(-7, 11);
    ctx.closePath();
    ctx.fill();

    // 桶内油漆：俯视角的椭圆，外圈用深绿、内层用更深的绿做高光。
    ctx.fillStyle = GRASS;
    ctx.beginPath();
    ctx.ellipse(0, -3, 9, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GRASS_DK;
    ctx.beginPath();
    ctx.ellipse(0, -3, 7, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 桶上方的金属提手。
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -3, 11, Math.PI * 1.2, Math.PI * 1.8, false);
    ctx.stroke();

    ctx.restore();
}

function drawEraseIcon(ctx) {
    // 经典铅笔橡皮：粉色橡皮头 + 金属箍 + 钴蓝笔身，
    // 整体微微倾斜，加上下方几粒橡皮屑，强化"擦除"的动作感。
    ctx.save();
    ctx.translate(22, 22);
    ctx.rotate(-0.5);

    // 钴蓝色笔身（铅笔木质/塑料部分）。
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-2, -7);
    ctx.lineTo(11, -7);
    ctx.lineTo(11, 7);
    ctx.lineTo(-2, 7);
    ctx.closePath();
    ctx.fill();

    // 粉色橡皮头（真正用来"擦"的部分，画在最左侧）。
    ctx.fillStyle = ERASER_PINK;
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.lineTo(-2, -7);
    ctx.lineTo(-2, 7);
    ctx.lineTo(-11, 7);
    ctx.closePath();
    ctx.fill();

    // 中间的金属箍，分隔橡皮头和笔身。
    ctx.fillStyle = PAPER;
    ctx.fillRect(-3, -7, 1.5, 14);

    ctx.restore();

    // 下方的橡皮屑，强调"擦动过"的动作。
    ctx.save();
    ctx.translate(22, 22);
    ctx.fillStyle = INK;
    ctx.fillRect(-12, 11, 3, 1.5);
    ctx.fillRect(-7,  13, 2, 1.2);
    ctx.fillRect(-3,  11, 2, 1.2);
    ctx.restore();
}

function drawPanIcon(ctx) {
    // 上下左右四向箭头——Figma / Photoshop / Sketch 等设计软件里
    // 通用的"移动 / 平移"图标。
    ctx.save();
    ctx.translate(22, 22);
    ctx.fillStyle = INK;

    // 中央十字主干。
    ctx.fillRect(-2, -7, 4, 14);
    ctx.fillRect(-7, -2, 14, 4);

    // 上箭头。
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-5, -7);
    ctx.lineTo(5, -7);
    ctx.closePath();
    ctx.fill();

    // 下箭头。
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(-5, 7);
    ctx.lineTo(5, 7);
    ctx.closePath();
    ctx.fill();

    // 左箭头。
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-7, -5);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();

    // 右箭头。
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(7, -5);
    ctx.lineTo(7, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawGridIcon(ctx) {
    // 简洁的 3×3 网格（横竖各 4 条线），一眼能看懂是
    // "显示/隐藏网线"的开关。

    ctx.save();
    ctx.translate(22, 22);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let i = -9; i <= 9; i += 6) {
        ctx.moveTo(-9, i);
        ctx.lineTo(9, i);
        ctx.moveTo(i, -9);
        ctx.lineTo(i, 9);
    }
    ctx.stroke();
    ctx.restore();
}

function drawSaveIcon(ctx) {
    // 软盘——几十年来"保存文件"的通用图标。
    // 上方是金属推杆 + 一个写保护缺口，
    // 下方是带两条线的纸质标签，暗示"可写入"。
    ctx.save();
    ctx.translate(22, 22);

    // 软盘外形：经典的"右上角斜切一刀"轮廓。
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-11, -11);
    ctx.lineTo(8, -11);
    ctx.lineTo(11, -8);
    ctx.lineTo(11, 11);
    ctx.lineTo(-11, 11);
    ctx.closePath();
    ctx.fill();

    // 顶部金属推杆。
    ctx.fillStyle = PAPER;
    ctx.fillRect(-7, -11, 13, 7);
    // 推杆上的写保护缺口。
    ctx.fillStyle = INK;
    ctx.fillRect(2, -10, 2.5, 5);

    // 下方的纸质标签。
    ctx.fillStyle = PAPER;
    ctx.fillRect(-7, -1, 14, 9);
    // 标签上的两条横线，暗示"可填写/可写入"。
    ctx.fillStyle = INK;
    ctx.fillRect(-5, 2, 10, 1);
    ctx.fillRect(-5, 5, 10, 1);

    ctx.restore();
}

function drawResetIcon(ctx) {
    // 弧形循环箭头——通用的"重来/重置"图标。
    // 弧度约 270°，缺口和箭头都在右上角。
    ctx.save();
    ctx.translate(22, 22);

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 9, Math.PI * 0.2, Math.PI * 1.75);
    ctx.stroke();

    // 弧线右上端的实心箭头，尖端指向中心，
    // 让"绕一圈回到起点"的循环感更明显。
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(2, -6);   // 内侧顶点，贴近弧线末端
    ctx.lineTo(10, -3);  // 外右
    ctx.lineTo(8, -11);  // 右上
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}
