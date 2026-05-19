#!/usr/bin/env python3
"""
将 AI 生成的素材图处理为项目可用的透明 PNG。
- 去掉模型常带的白底 / 棋盘格背景
- 裁切到可见内容
- 等比缩放并铺满目标画布 (居中, 保持比例)
- 输出 RGBA PNG

用法:
    python3 tools/process_asset.py <input> <output> <target_w> <target_h>
"""

from __future__ import annotations

import math
import struct
import sys
import zlib
from pathlib import Path


def read_png(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"not a png: {path}")
    pos = 8
    chunks = []
    while pos < len(data):
        n = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + n]
        chunks.append((tag, body))
        pos += 12 + n
    hdr = next(body for tag, body in chunks if tag == b"IHDR")
    w, h, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", hdr)
    if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
        raise SystemExit(f"unsupported png: bit={bit_depth} color={color_type}")
    channels = 3 if color_type == 2 else 4
    raw = zlib.decompress(b"".join(body for tag, body in chunks if tag == b"IDAT"))
    stride = w * channels
    rows: list[bytearray] = []
    prev = bytearray(stride)
    i = 0

    def paeth(a: int, b: int, c: int) -> int:
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        if pa <= pb and pa <= pc:
            return a
        if pb <= pc:
            return b
        return c

    for _ in range(h):
        f = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        if f != 0:
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                up = prev[x]
                ul = prev[x - channels] if x >= channels else 0
                if f == 1:
                    row[x] = (row[x] + left) & 255
                elif f == 2:
                    row[x] = (row[x] + up) & 255
                elif f == 3:
                    row[x] = (row[x] + ((left + up) // 2)) & 255
                elif f == 4:
                    row[x] = (row[x] + paeth(left, up, ul)) & 255
                else:
                    raise SystemExit(f"bad filter: {f}")
        rows.append(row)
        prev = row
    return w, h, channels, rows


def to_rgba(w: int, h: int, channels: int, rows):
    out_rows: list[bytearray] = []
    for row in rows:
        out = bytearray()
        for x in range(0, len(row), channels):
            r, g, b = row[x], row[x + 1], row[x + 2]
            a = row[x + 3] if channels == 4 else 255
            mx, mn = max(r, g, b), min(r, g, b)
            # 模型生成图的白底 / 浅灰棋盘格: 亮度高且饱和度低
            if mx > 200 and (mx - mn) < 28:
                r = g = b = 0
                a = 0
            out.extend((r, g, b, a))
        out_rows.append(out)
    return out_rows


def crop_to_visible(w: int, h: int, rows, padding: int = 6):
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y, row in enumerate(rows):
        for x in range(w):
            if row[x * 4 + 3] > 12:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if max_x < 0:
        return 0, 0, w, h
    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(w - 1, max_x + padding)
    max_y = min(h - 1, max_y + padding)
    return min_x, min_y, max_x - min_x + 1, max_y - min_y + 1


def resample_into(rows, src_x: int, src_y: int, src_w: int, src_h: int,
                  target_w: int, target_h: int, src_full_w: int):
    # 等比缩放 + 居中, 透明边距填充, 不裁掉素材.
    scale = min(target_w / src_w, target_h / src_h)
    draw_w = max(1, int(round(src_w * scale)))
    draw_h = max(1, int(round(src_h * scale)))
    off_x = (target_w - draw_w) // 2
    off_y = target_h - draw_h  # 让素材底部贴齐画布底部
    out_rows = [bytearray(target_w * 4) for _ in range(target_h)]
    for y in range(draw_h):
        sy = src_y + (y + 0.5) * src_h / draw_h - 0.5
        y0 = max(src_y, min(src_y + src_h - 1, int(math.floor(sy))))
        y1 = max(src_y, min(src_y + src_h - 1, y0 + 1))
        wy = sy - math.floor(sy)
        for x in range(draw_w):
            sx = src_x + (x + 0.5) * src_w / draw_w - 0.5
            x0 = max(src_x, min(src_x + src_w - 1, int(math.floor(sx))))
            x1 = max(src_x, min(src_x + src_w - 1, x0 + 1))
            wx = sx - math.floor(sx)
            vals = []
            for c in range(4):
                p00 = rows[y0][x0 * 4 + c]
                p10 = rows[y0][x1 * 4 + c]
                p01 = rows[y1][x0 * 4 + c]
                p11 = rows[y1][x1 * 4 + c]
                top = p00 * (1 - wx) + p10 * wx
                bot = p01 * (1 - wx) + p11 * wx
                vals.append(round(top * (1 - wy) + bot * wy))
            tx = off_x + x
            ty = off_y + y
            if 0 <= tx < target_w and 0 <= ty < target_h:
                i = tx * 4
                out_rows[ty][i : i + 4] = bytes(vals)
    return out_rows


def write_png(path: Path, w: int, h: int, rows):
    def chunk(tag: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + tag
            + body
            + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw.extend(row)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    if len(sys.argv) != 5:
        print("usage: process_asset.py <input> <output> <target_w> <target_h>")
        sys.exit(2)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    target_w = int(sys.argv[3])
    target_h = int(sys.argv[4])

    w, h, channels, rows = read_png(src)
    rgba_rows = to_rgba(w, h, channels, rows)
    cx, cy, cw, ch = crop_to_visible(w, h, rgba_rows)
    if cw == 0 or ch == 0:
        raise SystemExit(f"no visible pixels in {src}")
    out_rows = resample_into(rgba_rows, cx, cy, cw, ch, target_w, target_h, w)
    write_png(dst, target_w, target_h, out_rows)
    print(f"{dst} ({target_w}x{target_h}) <- crop {cw}x{ch} from {src.name}")


if __name__ == "__main__":
    main()
