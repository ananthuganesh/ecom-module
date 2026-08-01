"use client";

import {
  CloseIcon
} from "@/components/icons/storeIcons";
// Helper to map color names to hex codes for the UI
const getColorHex = (colorName) => {
    const map = {
        "black": "#000000",
        "blue": "#0000FF",
        "white": "#FFFFFF",
        "red": "#FF0000",
        "pink": "#FFC0CB",
        "yellow gold": "#E6C98C",
        "rose gold": "#F3C5B5",
        "silver": "#C0C0C0",
        "gold": "#FFD700",
        "green": "#008000",
        "purple": "#800080",
        "orange": "#FFA500",
        "brown": "#A52A2A",
        "gray": "#808080",
        "grey": "#808080",
        "navy": "#000080",
        "teal": "#008080",
        "maroon": "#800000",
        "olive": "#808000",
        "lime": "#00FF00",
        "cyan": "#00FFFF",
        "magenta": "#FF00FF",
        "beige": "#F5F5DC",
    };
    return map[colorName.toLowerCase()] || "#EEEEEE"; // Default light gray for unknown colors
};

const PRICE_RANGES = [
    { label: "Below 200", value: "0-200" },
    { label: "200 - 500", value: "200-500" },
    { label: "500 - 1000", value: "500-1000" },
    { label: "1000 - 1500", value: "1000-1500" },
    { label: "1500 - 2000", value: "1500-2000" },
    { label: "Above 2000", value: "2000-100000" },
];

export default function FilterSidebar({ filters, onFilterChange, onClose, isOpen, brands = [], colors = [] }) {
    
    // Toggle multiple values for Brand and Color
    const toggleMultiFilter = (type, value) => {
        const currentValues = filters[type] ? filters[type].split(',') : [];
        const index = currentValues.indexOf(value);
        
        let newValues;
        if (index > -1) {
            newValues = currentValues.filter(v => v !== value);
        } else {
            newValues = [...currentValues, value];
        }
        
        const newFilters = { ...filters };
        if (newValues.length > 0) {
            newFilters[type] = newValues.join(',');
        } else {
            delete newFilters[type];
        }
        onFilterChange(newFilters);
    };

    const handleSingleFilterChange = (type, value) => {
        const newFilters = { ...filters };
        if (newFilters[type] === value) {
            delete newFilters[type];
        } else {
            newFilters[type] = value;
        }
        onFilterChange(newFilters);
    };

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-in-out lg:sticky lg:top-20 lg:mt-10 lg:h-[calc(100vh-80px)] lg:translate-x-0 lg:z-0 ${
                isOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
            <div className="h-full flex flex-col px-6 pb-8 overflow-y-auto custom-scrollbar relative">
                <div className="sticky top-0 z-10 bg-white flex justify-between items-center py-5 mb-4 border-b border-gray-50/50">
                    <span className="text-[10px] tracking-[0.2em] font-bold uppercase text-primary">Filters</span>
                    <button onClick={onClose} className="lg:hidden p-1 -mr-1 hover:bg-gray-50 rounded-full transition-colors">
                        <CloseIcon className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Brand Section */}
                {brands.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Brand</h3>
                        <div className="space-y-3 pr-2">
                            {brands.map((brand) => {
                                const isSelected = (filters.brand?.split(',') || []).includes(brand);
                                return (
                                    <button
                                        key={brand}
                                        onClick={() => toggleMultiFilter("brand", brand)}
                                        className={`flex items-center gap-2 w-full group text-left ${
                                            isSelected ? "text-primary" : "text-gray-400 hover:text-primary"
                                        }`}
                                    >
                                        <div className={`w-3.5 h-3.5 border flex items-center justify-center ${
                                            isSelected ? "border-accent bg-accent" : "border-gray-300"
                                        }`}>
                                            {isSelected && <CloseIcon className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider truncate">{brand}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Color Section */}
                {colors.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Color</h3>
                        <div className="space-y-3 pr-2">
                            {colors.map((color) => {
                                const isSelected = (filters.color?.split(',') || []).includes(color);
                                return (
                                    <button
                                        key={color}
                                        onClick={() => toggleMultiFilter("color", color)}
                                        className="flex items-center gap-2 w-full group"
                                    >
                                        <div 
                                            className={`w-4 h-4 rounded-full border ${isSelected ? 'border-primary ring-1 ring-primary ring-offset-1' : 'border-gray-200'}`}
                                            style={{ backgroundColor: getColorHex(color) }}
                                        />
                                        <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors truncate ${
                                            isSelected ? "text-primary" : "text-gray-400 group-hover:text-primary"
                                        }`}>
                                            {color}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Price Section */}
                <div className="mb-8">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-4">Price</h3>
                    <div className="space-y-3">
                        {PRICE_RANGES.map((range) => (
                            <button
                                key={range.value}
                                onClick={() => handleSingleFilterChange("priceRange", range.value)}
                                className={`flex items-center gap-2 w-full group text-left ${
                                    filters.priceRange === range.value ? "text-primary" : "text-gray-400 hover:text-primary"
                                }`}
                            >
                                <div className={`w-3.5 h-3.5 border flex items-center justify-center ${
                                    filters.priceRange === range.value ? "border-accent bg-accent" : "border-gray-300"
                                }`}>
                                    {filters.priceRange === range.value && <CloseIcon className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider">{range.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={() => onFilterChange({})}
                    className="mt-2 text-[10px] tracking-[0.1em] font-bold uppercase text-accent hover:underline text-left"
                >
                    Clear All
                </button>
            </div>
        </aside>
    );
}
