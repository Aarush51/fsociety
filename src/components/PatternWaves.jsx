export default function PatternWaves() {
  return (
    <div className="pattern-waves" aria-hidden="true">
      <svg viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="waveFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7c5cff" stopOpacity="0" />
            <stop offset="0.18" stopColor="#7c5cff" stopOpacity="0.42" />
            <stop offset="0.62" stopColor="#c8ff4d" stopOpacity="0.34" />
            <stop offset="1" stopColor="#c8ff4d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 18 }, (_, index) => (
          <path
            key={index}
            d={`M -120 ${155 + index * 24} C 180 ${55 + index * 31}, 420 ${325 - index * 18}, 720 ${185 + index * 17} S 1210 ${315 - index * 13}, 1560 ${130 + index * 27}`}
            fill="none"
            stroke="url(#waveFade)"
            strokeWidth={index % 4 === 0 ? 2 : 1}
            opacity={0.34 + (index % 5) * 0.08}
          />
        ))}
      </svg>
    </div>
  );
}
