"use client";

import { useCallback, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function ImageCropModal({
  isOpen,
  imageSrc,
  aspect = 3 / 4,
  title = "Crop image",
  onCancel,
  onCropComplete,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const cropSize = useMemo(() => ({ width: 240, height: Math.round(240 / aspect) }), [aspect]);

  const handleCropComplete = useCallback((_croppedArea, croppedAreaPx) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel?.()}>
      <DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-muted px-3 py-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative h-[360px] bg-foreground">
          {imageSrc && <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={aspect} cropSize={cropSize} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={handleCropComplete} />}
        </div>
        <div className="space-y-3 border-t border-border bg-background px-3 py-3">
          <Field orientation="horizontal">
            <FieldLabel className="w-10">Zoom</FieldLabel>
            <Input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full p-0"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="button" onClick={() => onCropComplete?.(croppedAreaPixels)} disabled={!croppedAreaPixels}>
              <Check className="w-3.5 h-3.5" /> Use
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

