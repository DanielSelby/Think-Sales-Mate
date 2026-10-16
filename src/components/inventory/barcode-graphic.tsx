"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeGraphic({
  value,
  onError,
  className = "",
}: {
  value: string;
  onError?: (message: string | null) => void;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    if (!value.trim()) {
      onErrorRef.current?.("This product has no barcode saved.");
      return;
    }
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: false,
        height: 48,
        width: 1.6,
        margin: 8,
        lineColor: "#000000",
        background: "#ffffff",
      });
      onErrorRef.current?.(null);
    } catch (error) {
      onErrorRef.current?.(error instanceof Error
        ? `Barcode cannot be encoded: ${error.message}`
        : "Barcode cannot be encoded. Check the saved barcode value.");
    }
  }, [value]);

  return <svg ref={svgRef} className={`barcode-label-graphic mx-auto my-2 max-w-full ${className}`} role="img" aria-label={`Code 128 barcode for ${value}`} />;
}
