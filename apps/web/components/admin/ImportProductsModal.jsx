"use client";

import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { adminProductService } from "@/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function ImportProductsModal({ isOpen, onClose, onSuccess }) {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && selectedFile.type === "text/csv") {
            setFile(selectedFile);
            setResult(null);
        } else {
            toast.error("Please select a valid CSV file");
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const data = await adminProductService.importProducts(file);
            setResult(data);
            toast.success("Import processed successfully");
            if (onSuccess) onSuccess();
        } catch (error) {
            console.error("Import failed:", error);
            toast.error(error.response?.data?.message || "Failed to import products");
        } finally {
            setLoading(false);
        }
    };

    const downloadSample = () => {
        const headers = "productId,productName,category,brand,buyingPrice,sellingPrice,variantColor,variantQuantity,variantSku,description,thumbnails,status,stone,gender,variantImages";
        const sampleRow = "\nPROD001,Premium Cotton Tee,Apparel,Urban Aana,500,999,Black,10,TEE-BLK-L,\"High quality cotton tee\",https://example.com/thumb.jpg,active,None,Unisex,https://example.com/img1.jpg";
        const blob = new Blob([headers + sampleRow], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'product_import_sample.csv';
        a.click();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg p-0">
                <DialogHeader className="border-b border-border bg-muted/50 px-6 py-4">
                    <DialogTitle className="flex items-center gap-2">
                        <Upload /> Import Products from CSV
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 pb-6">
                    {!result ? (
                        <div className="space-y-6">
                            <Empty className={`border-2 border-dashed p-8 ${
                                file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                            }`}>
                                <Input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="sr-only"
                                    id="csv-upload"
                                />
                                <label htmlFor="csv-upload" className="cursor-pointer">
                                    <EmptyHeader>
                                        <EmptyMedia variant="icon" className="size-12 rounded-full">
                                            {file ? <FileText className="size-6 text-primary" /> : <Upload className="size-6 text-muted-foreground" />}
                                        </EmptyMedia>
                                        <EmptyTitle>{file ? file.name : "Click to select CSV file"}</EmptyTitle>
                                        <EmptyDescription>Max size: 10MB</EmptyDescription>
                                    </EmptyHeader>
                                </label>
                            </Empty>

                            <div className="flex flex-col gap-3">
                                <Button
                                    onClick={handleUpload}
                                    disabled={!file || loading}
                                    className="w-full"
                                    size="lg"
                                >
                                    {loading ? <Spinner /> : <CheckCircle2 />}
                                    {loading ? "Processing..." : "Start Import"}
                                </Button>
                                <Button
                                    onClick={downloadSample}
                                    variant="secondary"
                                    className="w-full"
                                    size="lg"
                                >
                                    <Download />
                                    Download Sample CSV
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <Card className="gap-4 bg-muted/50">
                                <CardHeader className="pb-0">
                                    <CardTitle className="flex items-center justify-between">
                                        Import Summary
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {new Date().toLocaleTimeString()}
                                        </span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-3 gap-4 text-center">
                                    <div className="rounded-lg border border-border bg-card p-3">
                                        <p className="text-xl font-medium">{result.summary.totalProducts}</p>
                                        <p className="text-xs text-muted-foreground">Total</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card p-3">
                                        <p className="text-xl font-medium text-primary">{result.summary.successCount}</p>
                                        <p className="text-xs text-muted-foreground">Success</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-card p-3">
                                        <p className="text-xl font-medium text-destructive">{result.summary.errorCount}</p>
                                        <p className="text-xs text-muted-foreground">Errors</p>
                                    </div>
                                </CardContent>
                            </Card>

                            {result.errors?.length ? (
                                <div className="space-y-2">
                                    <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                                        <AlertCircle /> Error Log
                                    </p>
                                    <div className="max-h-32 space-y-1 overflow-y-auto pr-2">
                                        {result.errors.map((err, idx) => (
                                            <div key={idx} className="rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                                                <span>ID {err.productId}:</span> {err.error}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                {result ? (
                    <DialogFooter className="border-t border-border px-6 py-4">
                        <Button onClick={onClose} className="w-full" size="lg">
                            Done
                        </Button>
                    </DialogFooter>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
