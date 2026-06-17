import { Product } from "@/lib/types"

interface Props {
  product: Product
  isSelected: boolean
  onSelect: () => void
  onDelete?: () => void
  deleting?: boolean
  showDelete?: boolean
}

export default function ProductCard({
  product,
  isSelected,
  onSelect,
  onDelete,
  deleting = false,
  showDelete = false,
}: Props) {
  return (
    <div
      className="glass-card overflow-hidden cursor-pointer relative"
      style={
        isSelected
          ? { border: "1px solid rgba(245,158,11,0.55)", boxShadow: "0 0 0 3px rgba(245,158,11,0.09)" }
          : undefined
      }
      onClick={onSelect}
    >
      <div
        style={{
          height: 100,
          background: product.bg_color || "rgba(255,245,235,0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {product.image_urls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_urls[0]}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            🍞
          </div>
        )}
        {isSelected && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(245,158,11,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        <p className="text-sm font-semibold truncate" style={{ color: "#fff8f0" }}>
          {product.name}
        </p>
        {product.features.length > 0 && (
          <p className="text-xs mt-1 truncate" style={{ color: "rgba(255,220,180,0.4)" }}>
            {product.features.slice(0, 2).join(" · ")}
          </p>
        )}
        <p className="text-xs mt-1" style={{ color: "rgba(255,220,180,0.25)" }}>
          사진 {product.image_urls.length}장
        </p>
      </div>

      {showDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={deleting}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.4 : 1,
            color: "white",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
