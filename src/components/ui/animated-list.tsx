"use client"

import { Children, type ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

type AnimatedListProps = {
  children: ReactNode
  className?: string
  itemClassName?: string
  stagger?: number
  duration?: number
  yOffset?: number
  once?: boolean
}

export default function AnimatedList({
  children,
  className,
  itemClassName,
  stagger = 0.06,
  duration = 0.28,
  yOffset = 8,
  once = true,
}: AnimatedListProps) {
  const items = Children.toArray(children)

  return (
    <div className={className}>
      {items.map((child, index) => (
        <motion.div
          key={index}
          className={cn(itemClassName)}
          initial={{ opacity: 0, y: yOffset }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once, amount: 0.2 }}
          transition={{
            duration,
            delay: index * stagger,
            ease: "easeOut",
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}
