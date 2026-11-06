import { useTheme } from "../context/ThemeContext";
import PatternWaves from "./PatternWaves";

const TUNING = {
  dark: { color: "#ffb000", opacity: 0.3 },
  light: { color: "#b45309", opacity: 0.35 },
};

// Decorative WebGL backdrop for page heroes. The theme comes from the existing
// light/dark toggle; the key remounts PatternWaves so it picks up the palette.
export default function HeroBackground({ opacity }) {
  const { theme } = useTheme();
  const mode = theme === "dark" ? "dark" : "light";
  const tuning = TUNING[mode];

  return (
    <div className="hero-bg" aria-hidden="true">
      <PatternWaves
        key={mode}
        preset="terminal"
        color={tuning.color}
        backgroundColor="transparent"
        fade="center"
        opacity={opacity ?? tuning.opacity}
        cursorSize={60}
      />
    </div>
  );
}
