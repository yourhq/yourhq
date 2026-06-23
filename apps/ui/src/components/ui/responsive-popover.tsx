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

const MobileCtx = React.createContext(false)

function ResponsivePopover({
  children,
  ...props
}: React.ComponentProps<typeof Popover>) {
  const mobile = useIsMobile()

  return (
    <MobileCtx.Provider value={mobile}>
      {mobile ? (
        <Drawer {...props}>{children}</Drawer>
      ) : (
        <Popover {...props}>{children}</Popover>
      )}
    </MobileCtx.Provider>
  )
}

function ResponsivePopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverTrigger>) {
  const mobile = React.useContext(MobileCtx)
  return mobile ? <DrawerTrigger {...props} /> : <PopoverTrigger {...props} />
}

function ResponsivePopoverContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const mobile = React.useContext(MobileCtx)

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
