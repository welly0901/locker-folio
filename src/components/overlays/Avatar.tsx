/** 工牌上的扁平插画头像 */
export default function Avatar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 200" fill="none" role="img" aria-label="头像插画">
      {/* 上衣 */}
      <path d="M26 200c3-24 20-37 54-37s51 13 54 37z" fill="#FAF8F4" />
      {/* 脖子 */}
      <path d="M69 142h22v22c0 5-4 8-11 8s-11-3-11-8z" fill="#E29580" />
      {/* 头发：后层垂到肩，中间留出脸的位置 */}
      <path
        d="M80 4C46 4 26 26 26 64v104c0 7 5 12 12 12h6V70h72v110h6c7 0 12-5 12-12V64C134 26 114 4 80 4Z"
        fill="#472A21"
      />
      {/* 脸 */}
      <ellipse cx="80" cy="88" rx="38" ry="42" fill="#F1AC98" />
      {/* 刘海 */}
      <path d="M42 70c0-27 15-43 38-43s38 16 38 43c-9-14-21-21-38-21s-29 7-38 21Z" fill="#472A21" />
      <path d="M26 64C26 26 46 4 80 4s54 22 54 60v8c-11-17-30-27-54-27S37 55 26 72Z" fill="#3E241C" />
      {/* 眼镜 */}
      <g stroke="#FCF9F4" strokeWidth="4" fill="#FCF9F4">
        <circle cx="60" cy="90" r="15" />
        <circle cx="100" cy="90" r="15" />
      </g>
      <path d="M75 90h10" stroke="#FCF9F4" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M42 86l4-2M118 86l-4-2" stroke="#FCF9F4" strokeWidth="3.8" strokeLinecap="round" />
      {/* 眼睛 */}
      <path d="M55 89.5h10M95 89.5h10" stroke="#2B1A15" strokeWidth="3.4" strokeLinecap="round" />
      {/* 鼻 / 嘴 */}
      <path d="M80 98v10" stroke="#D65D3D" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M74 118c4 2.6 8 2.6 12 0" stroke="#C44F38" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
