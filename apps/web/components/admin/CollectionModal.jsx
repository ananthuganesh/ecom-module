"use client";

import { useState, useEffect } from "react";
import { Upload, Search, Check, Image as ImageIcon } from "lucide-react";
import { adminProductService, adminCollectionService, adminCategoryService } from "@/api";
import { toast } from "sonner";
import SafeImage from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export default function CollectionModal({ isOpen, onClose, collection, onSuccess }) {
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        summary: "",
        image: "",
        products: [],
        category: "",
    });

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
            if (collection) {
                setFormData({
                    title: collection.title || "",
                    summary: collection.summary || "",
                    image: collection.image || "",
                    products: collection.products?.map(p => typeof p === 'object' ? p._id : p) || [],
                    category: collection.category?._id || collection.category || "",
                });
            } else {
                setFormData({
                    title: "",
                    summary: "",
                    image: "",
                    products: [],
                    category: "",
                });
            }
        }
    }, [isOpen, collection]);

    useEffect(() => {
        if (isOpen) {
            if (formData.category) {
                fetchProducts(formData.category);
            } else {
                setProducts([]);
            }
        }
    }, [formData.category, isOpen]);

    const fetchCategories = async () => {
        setLoadingCategories(true);
        try {
            const data = await adminCategoryService.getAll();
            setCategories(data);
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setLoadingCategories(false);
        }
    };

    const fetchProducts = async (categoryId) => {
        setProducts([]);
        setLoadingProducts(true);
        try {
            const params = categoryId ? { category: categoryId } : {};
            const productList = await adminProductService.getAllProducts(params);
            setProducts(Array.isArray(productList) ? productList : []);
        } catch (error) {
            console.error("Error fetching products:", error);
            setProducts([]);
        } finally {
            setLoadingProducts(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            const data = await adminProductService.uploadImage(file);
            setFormData({ ...formData, image: data.url });
            toast.success("Image uploaded");
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setLoading(false);
        }
    };

    const toggleProduct = (productId) => {
        setFormData(prev => {
            const isSelected = prev.products.includes(productId);
            return {
                ...prev,
                products: isSelected 
                    ? prev.products.filter(id => id !== productId) 
                    : [...prev.products, productId]
            };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title) return toast.error("Title is required");
        if (!formData.category) return toast.error("Category is required");

        setLoading(true);
        try {
            if (collection?._id) {
                await adminCollectionService.update(collection._id, formData);
                toast.success("Collection updated");
            } else {
                await adminCollectionService.create(formData);
                toast.success("Collection created");
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter(p => 
        (p.productName || p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.productId || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0" showCloseButton={false}>
                <DialogHeader className="border-b border-border bg-muted/30 px-6 py-4">
                    <DialogTitle>{collection ? "Edit collection" : "Create new collection"}</DialogTitle>
                </DialogHeader>
                <form id="collection-form" onSubmit={handleSubmit} className="grid max-h-[70vh] overflow-y-auto md:grid-cols-[20rem_1fr]">
                    <div className="space-y-5 border-b border-border bg-muted/20 p-6 md:border-r md:border-b-0">
                        <Field><FieldLabel>Category</FieldLabel><Select value={formData.category} onValueChange={(category) => setFormData({ ...formData, category })}><SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map((cat) => <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>)}</SelectContent></Select></Field>
                        <Field><FieldLabel>Collection title</FieldLabel><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Summer essentials" /></Field>
                        <Field><FieldLabel>Summary</FieldLabel><Textarea value={formData.summary} onChange={(e) => setFormData({ ...formData, summary: e.target.value })} placeholder="Describe this collection..." /></Field>
                        <Field><FieldLabel>Collection image</FieldLabel><div className="relative flex h-40 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted"><label htmlFor="col-image" className="flex size-full cursor-pointer items-center justify-center">{formData.image ? <SafeImage src={formData.image} alt="Collection preview" fill className="object-cover" /> : <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground"><ImageIcon className="size-7" />Upload banner</span>}<span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity hover:opacity-100"><Upload className="size-5 text-foreground" /></span></label><Input type="file" id="col-image" className="hidden" onChange={handleImageUpload} accept="image/*" /></div></Field>
                    </div>
                    <div className="flex min-h-96 flex-col p-6">
                        <div className="mb-4 flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">Select products ({formData.products.length})</p><div className="relative w-60"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" placeholder="Search products..." /></div></div>
                        <div className="flex-1 rounded-md border border-border bg-muted/20 p-3">{loadingProducts ? <div className="flex h-full min-h-48 items-center justify-center"><Spinner /></div> : <div className="grid gap-2 sm:grid-cols-2">{filteredProducts.map((product) => { const selected = formData.products.includes(product._id); return <Button key={product._id} type="button" variant="outline" onClick={() => toggleProduct(product._id)} className={`h-auto justify-start gap-2 p-2 text-left ${selected ? "border-primary bg-primary/10" : ""}`}><span className={`flex size-4 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected && <Check className="size-3" />}</span><span className="relative h-10 w-8 shrink-0 overflow-hidden rounded bg-muted"><SafeImage src={product.thumbnails?.[0] || product.variants?.[0]?.images?.[0]} fill className="object-cover" /></span><span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{product.productName || product.name}</span><span className="block text-xs text-muted-foreground">{product.productId}</span></span></Button>; })}{filteredProducts.length === 0 && <p className="col-span-2 py-12 text-center text-xs text-muted-foreground">{formData.category ? "No products found in this category" : "Select a category to see products"}</p>}</div>}</div>
                    </div>
                </form>
                <DialogFooter className="border-t border-border bg-muted/30 px-6 py-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button form="collection-form" type="submit" disabled={loading}>{loading && <Spinner />} {collection ? "Save changes" : "Create collection"}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
