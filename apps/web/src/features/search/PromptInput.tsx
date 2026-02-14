"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function PromptInput({
    value,
    onChange,
    placeholder = "Optional: Scandinavian style, light wood, under $300...",
    className,
}: PromptInputProps) {
    return (
        <div className={cn("space-y-4", className)}>
            <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400/80 px-1">
                Optional Refinement
            </div>

            <div
                className={cn(
                    "flex items-center w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl transition-all group-focus-within:ring-4 group-focus-within:ring-primary/10 group-focus-within:border-primary/20",
                    "hover:border-slate-200 hover:shadow-sm"
                )}
            >
                <Search className="w-5 h-5 stroke-[2] text-slate-400 group-focus-within:text-primary transition-colors shrink-0 mr-4" />

                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-none outline-none text-base text-slate-700 placeholder:text-slate-300 font-medium h-full w-full"
                    maxLength={500}
                />

                {value && (
                    <button
                        onClick={() => onChange("")}
                        className="p-1.5 rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all animate-fade-in shrink-0 ml-2"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
