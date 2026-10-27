/** Área: Comportamento do cabeçalho conforme a direção da rolagem e o foco. */
import { useCallback, useEffect, useState, type RefObject } from "react";

/** Only page scrolling hides the header; nested tables/dialogs keep native scrolling. */
export function useAutoHideHeader(
  header: RefObject<HTMLElement | null>,
  routeKey: string,
  blocked: boolean,
) {
  const [hidden, setHidden] = useState(false);
  const reveal = useCallback(() => setHidden(false), []);
  useEffect(() => {
    setHidden(false);
    let lastY = Math.max(0, window.scrollY);
    let anchor = lastY;
    let direction = 0;
    let frame: number | null = null;
    /** Avalia direção, distância e foco antes de atualizar a visibilidade do cabeçalho. */
    const update = () => {
      frame = null;
      const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maximum));
      const focused = document.activeElement;
      const keyboardFocus =
        focused && header.current?.contains(focused) && focused.matches(":focus-visible");
      const openControl = header.current?.querySelector('[data-state="open"]');
      if (y <= 80 || blocked || keyboardFocus || openControl) {
        setHidden(false);
        anchor = y;
        direction = 0;
      } else {
        const nextDirection = Math.sign(y - lastY);
        if (nextDirection && nextDirection !== direction) {
          anchor = lastY;
          direction = nextDirection;
        }
        if (Math.abs(y - anchor) >= 12) {
          setHidden(direction > 0);
          anchor = y;
        }
      }
      lastY = y;
    };
    /** Agrupa os eventos de rolagem no próximo quadro de renderização. */
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    /** Revela o cabeçalho e reinicia a referência de rolagem após redimensionamento. */
    const onResize = () => {
      lastY = Math.max(0, window.scrollY);
      anchor = lastY;
      direction = 0;
      setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [header, routeKey, blocked]);
  return { hidden, reveal };
}
