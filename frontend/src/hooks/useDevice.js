/**
 * Detects whether the app is running on a TV/remote device or a touch phone.
 *
 * TV / remote  →  isTVDevice = true
 *   • Fire Stick Silk, AndroidTV, any device whose UA contains TV/FireTV/AFTS
 *   • ANY device without a touch screen (laptops, desktops) — they use keyboard
 *
 * Phone / tablet  →  isPhone = true
 *   • Has a touch screen AND UA does NOT look like a TV
 *
 * Examples
 * ────────
 *   Fire Stick Silk  (no touch, UA "Silk")  →  isTVDevice ✓
 *   Android phone    (touch, no TV UA)       →  isPhone    ✓
 *   iPhone           (touch, no TV UA)       →  isPhone    ✓
 *   MacBook          (no touch)              →  isTVDevice ✓  (keyboard nav for dev)
 *   Samsung Smart TV (UA "TV")               →  isTVDevice ✓
 */
import { useMemo } from 'react';

export function useDevice() {
  return useMemo(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0;
    const isTV = /TV|FireTV|Silk|AFTS|AndroidTV/i.test(navigator.userAgent);
    const isPhone = isTouchDevice && !isTV;
    const isTVDevice = isTV || !isTouchDevice;
    return { isPhone, isTVDevice };
  }, []);
}

