/** 飲料店 logo；沒有官方 logo 的店用店名第一個詞做成文字章 */
export function ShopLogo({ logo, shop, size = 80, className = '' }: { logo: string; shop: string; size?: number; className?: string }) {
  const box = `grid flex-none place-items-center overflow-hidden rounded-xl border-2 border-soy bg-rice ${className}`
  if (logo) {
    return (
      <span className={box} style={{ width: size, height: size }}>
        <img src={logo} alt={shop} className="size-full object-contain" />
      </span>
    )
  }
  return (
    <span className={`${box} bg-yolk text-center leading-tight`} style={{ width: size, height: size, fontSize: size / 4.5 }} role="img" aria-label={shop}>
      {shop.split(' ')[0]}
    </span>
  )
}
