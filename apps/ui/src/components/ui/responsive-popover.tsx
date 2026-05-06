"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

function ResponsivePopover({
  children,
  ...props
}: React.ComponentProps<typeof Popover>) {
  const mobile = useIsMobile()

  if (mobile) {
    return <Drawer {...props}>{children}</Drawer>
  }

  return <Popover {...props}>{children}</Popover>
}

function ResponsivePopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverTrigger>) {
  const mobile = useIsMobile()
  return mobile ? <DrawerTrigger {...props} /> : <PopoverTrigger {...props} />
}

function ResponsivePopoverContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const mobile = useIsMobile()

  if (mobile) {
    return (
      <DrawerContent>
        <div className={cn("p-4", className)}>{children}</div>
      </DrawerContent>
    )
  }

  return (
    <PopoverContent className={className} {...props}>
      {children}
    </PopoverContent>
  )
}

export {
  ResponsivePopover,
  ResponsivePopoverTrigger,
  ResponsivePopoverContent,
}
