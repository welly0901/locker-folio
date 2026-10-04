#!/usr/bin/env bash
# 为作品图生成与显示尺寸匹配的响应式变体（方案 §12.2）。
#
# 原图都是 1000–1400px 宽，而实际显示宽度只有 200–530 CSS px，
# 直接用原图会让每张图的 RGBA 解码内存翻好几倍。这里按各栏目的
# 最大显示宽度 ×1 / ×2 生成两档变体，页面用 srcset/sizes 交给浏览器挑。
#
# 依赖：libwebp 的 dwebp / cwebp（brew install webp）。
# 用法：bash scripts/gen-image-variants.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
assets="$root/public/assets"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 目录:宽度列表（逗号分隔），宽度取自各栏目的 1x / 2x 显示尺寸
targets=(
  "photo:300,600,900"  # 照片墙格子 300px
  "posters:400,700"    # 海报卡 210–330px
  "ppt:480,900"        # PPT 平铺卡片 ≤900px
  "character:400,700" # 角色海报单页 ≤360px
  "ip:360,640"        # IP 形象配图竖版 ≤420px
  "xhs:400,700"       # 小红书封面轮播 3:4 竖版
  "font:360,640"      # 字体设计轮播 ≤300px / 展开图 ≤480px
  "study:480,900"     # 学习单设计平铺卡片 ≤900px
  "pkg:480,900"       # 包装设计平铺卡片 ≤900px
  "cover:480,640,960"  # 视频封面 ≤435px / 网站卡 ≤532px
)

for entry in "${targets[@]}"; do
  dir="${entry%%:*}"
  widths="${entry#*:}"
  for src in "$assets/$dir"/*.webp; do
    base="$(basename "$src" .webp)"
    case "$base" in *-[0-9]*) continue ;; esac # 跳过已生成的变体
    png="$tmp/$base.png"
    dwebp -quiet "$src" -o "$png"
    IFS=',' read -ra ws <<<"$widths"
    for w in "${ws[@]}"; do
      out="$assets/$dir/$base-$w.webp"
      cwebp -quiet -q 80 -m 6 -sharp_yuv -resize "$w" 0 "$png" -o "$out"
      printf '%s  %s\n' "$(du -h "$out" | cut -f1)" "${out#"$root/"}"
    done
    rm -f "$png"
  done
done
