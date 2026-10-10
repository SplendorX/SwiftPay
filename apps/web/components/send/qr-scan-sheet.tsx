"use client";

import { CameraOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * The camera, reading QR codes until one decodes. Frames are scaled down
 * before decoding so slower phones keep up.
 */
export function QrScanSheet({
  onClose,
  onResult,
  open,
}: {
  onClose: () => void;
  onResult: (text: string) => void;
  open: boolean;
}) {
  const side = useSheetSide();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "blocked">("starting");
  // Read through a ref so a new callback each render doesn't restart the camera.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    setStatus("starting");

    async function start() {
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } }),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = media;
        await video.play();
        setStatus("scanning");

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (stopped || !context) return;
          if (video.readyState >= 2 && video.videoWidth) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              stopped = true;
              onResultRef.current(code.data);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setStatus("blocked");
      }
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? bottomSheetClassName : "w-full sm:max-w-md")}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="sx-sheet">
          <SheetTitle className="text-center text-lg font-bold">Scan to pay</SheetTitle>
          <SheetDescription className="text-center text-sm text-muted-foreground">
            Point the camera at a SaphraONE QR code or an Arc wallet address.
          </SheetDescription>
          <div className="sx-scan">
            <video muted playsInline ref={videoRef} />
            <span aria-hidden className="sx-scan-frame" />
            {status === "starting" ? (
              <span className="sx-scan-state">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            ) : status === "blocked" ? (
              <span className="sx-scan-state">
                <CameraOff className="h-6 w-6" />
                Camera unavailable. Allow camera access in your browser settings, or paste the address instead.
              </span>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
