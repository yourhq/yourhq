"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

type Variant = "bottom-sheet" | "fullscreen"

interface ResponsiveDialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: Variant
}

function ResponsiveDialog({
  children,
  variant = "bottom-sheet",
  ...props
}: ResponsiveDialogProps) {
  const mobile = useIsMobile()

  if (mobile) {
    return (
      <Drawer {...props} autoFocus>
        {children}
      </Drawer>
    )
  }

  return <Dialog {...props}>{children}</Dialog>
}

function ResponsiveDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const mobile = useIsMobile()
  return mobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />
}

function ResponsiveDialogContent({
  className,
  children,
  variant = "bottom-sheet",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  variant?: Variant
  showCloseButton?: boolean
}) {
  const mobile = useIsMobile()

  if (mobile) {
    return (
      <DrawerContent
        className={cn(
          variant === "fullscreen" && "mt-0 max-h-[100dvh] rounded-none",
          className
        )}
        {...props}
      >
        {children}
      </DrawerContent>
    )
  }

  return (
    <DialogContent
      className={className}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DialogContent>
  )
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const mobile = useIsMobile()
  return mobile ? (
    <DrawerHeader className={className} {...props} />
  ) : (
    <DialogHeader className={className} {...props} />
  )
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const mobile = useIsMobile()
  return mobile ? (
    <DrawerFooter className={className} {...props} />
  ) : (
    <DialogFooter className={className} {...props} />
  )
}

function ResponsiveDialogTitle({
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  const mobile = useIsMobile()
  return mobile ? <DrawerTitle {...props} /> : <DialogTitle {...props} />
}

function ResponsiveDialogDescription({
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  const mobile = useIsMobile()
  return mobile ? (
    <DrawerDescription {...props} />
  ) : (
    <DialogDescription {...props} />
  )
}

function ResponsiveDialogClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  const mobile = useIsMobile()
  return mobile ? <DrawerClose {...props} /> : <DialogClose {...props} />
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogClose,
}
