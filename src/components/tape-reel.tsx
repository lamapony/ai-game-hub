export function TapeReel({ className = "", label }: { className?: string; label?: string }) {
  return (
    <div className={`agh-tape-reel-wrap ${className}`} aria-hidden="true">
      <svg className="agh-tape-reel" viewBox="0 0 220 220" focusable="false">
        <circle className="agh-tape-reel-shell" cx="110" cy="110" r="104" />
        <circle className="agh-tape-reel-bed" cx="110" cy="110" r="89" />
        <circle className="agh-tape-reel-rim" cx="110" cy="110" r="92" />
        <path className="agh-tape-reel-spokes" d="M110 110V34m0 76 66 38m-66-38-66 38" />
        <circle className="agh-tape-reel-hub" cx="110" cy="110" r="20" />
        <circle className="agh-tape-reel-spindle" cx="110" cy="110" r="7" />
        <g className="agh-tape-reel-fasteners">
          <circle cx="110" cy="15" r="3" />
          <circle cx="192" cy="157" r="3" />
          <circle cx="28" cy="157" r="3" />
        </g>
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}

export function DiagonalArrow() {
  return (
    <svg className="agh-diagonal-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 18 18 6M9 6h9v9" />
    </svg>
  );
}
