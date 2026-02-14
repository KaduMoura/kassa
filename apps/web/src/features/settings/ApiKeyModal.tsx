"use client";

import { useState } from "react";
import { Key, ShieldCheck, ExternalLink, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (key: string) => void;
    currentKey: string;
}

export function ApiKeyModal({ isOpen, onClose, onSave, currentKey }: ApiKeyModalProps) {
    const [key, setKey] = useState(currentKey);
    const [showKey, setShowKey] = useState(false);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(key);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg glass-card rounded-3xl p-8 shadow-2xl animate-slide-up border-primary/20">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-secondary transition-colors"
                >
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>

                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                            <Key className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-2xl font-display font-bold tracking-tight">Gemini API Key</h2>
                            <p className="text-sm text-muted-foreground">Required for AI Vision and Reranking</p>
                        </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-3">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <ShieldCheck className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Privacy Guaranteed</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Your key is stored <strong>only in memory</strong>. It is never saved to a database, local storage, or transmitted anywhere except to the Inspira AI backend for processing.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold px-1">Your Key</label>
                        <div className="relative group">
                            <input
                                type={showKey ? "text" : "password"}
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full pl-4 pr-12 py-3 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-mono text-sm"
                            />
                            <button
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-4">
                        <button
                            onClick={handleSave}
                            disabled={!key.trim()}
                            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:grayscale"
                        >
                            Save Environment Key
                        </button>

                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-2"
                        >
                            Get a free Gemini API key
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
