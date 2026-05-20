/**
 * SaveSystem.js
 *
 * 基于 localStorage 的存档系统。会把整张地图（地形 + 已放置模型）
 * 以及当前相机状态（偏移 + 缩放）一起存下来，
 * 下次回到游戏时镜头和地图都在原位，体验更自然。
 *
 * 存档 key 在 config.js 的 storageKey 里配置，
 * 想"作废老存档"时把 key 里的版本号 v1 改成 v2 即可。
 *
 * 二次开发常见入口：
 *   - 想加额外字段（比如保存当前工具、选中素材）：
 *     在 save() 的 payload 里新增字段，并在 load() 里读回；
 *     旧存档没有该字段时给出合理默认值，不要直接报错。
 *   - 想做版本迁移：根据 data.v 走不同分支，把旧字段映射成新格式。
 *   - 想换存储方式（比如改成 IndexedDB / 后端 API）：
 *     只需要替换 save / load / clear 三个方法的内部实现即可。
 */

import { CONFIG } from '../config.js';
import { PlacedObject } from '../building/PlacedObject.js';

const KEY = CONFIG.storageKey;

export const SaveSystem = {
    save(tileMap, camera) {
        const payload = {
            v: 1,
            tileMap: tileMap.serialize(),
            camera: {
                offsetX: camera.offsetX,
                offsetY: camera.offsetY,
                zoom: camera.zoom,
            },
        };
        try {
            localStorage.setItem(KEY, JSON.stringify(payload));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    },

    load(tileMap, camera) {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            tileMap.deserialize(data.tileMap, d => new PlacedObject(d));
            if (data.camera) {
                camera.offsetX = data.camera.offsetX;
                camera.offsetY = data.camera.offsetY;
                camera.zoom    = data.camera.zoom;
            }
            return true;
        } catch (e) {
            console.error('Load failed:', e);
            return false;
        }
    },

    clear() {
        try { localStorage.removeItem(KEY); } catch {}
    },
};
