"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function DashboardMotionItem({
  children,
  className,
  delay = 0,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover && !reduceMotion ? { y: -3 } : undefined}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
