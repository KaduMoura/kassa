"use client";

import { useState } from "react";
import { Settings, Key, RotateCcw, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useSearchController } from "@/hooks/useSearchController";
import { UploadPanel } from "@/features/search/UploadPanel";
import { PromptInput } from "@/features/search/PromptInput";
import { ResultsList } from "@/features/search/ResultsList";
import { ApiKeyModal } from "@/features/settings/ApiKeyModal";
import { cn } from "@/lib/utils";

export default function HomePage() {
    const {
        status,
        results,
        error,
        image,
        imagePreview,
        prompt,
        apiKey,
        setApiKey,
        setImage,
        setPrompt,
        executeSearch,
        reset,
    } = useSearchController();

    const [isApiModalOpen, setIsApiModalOpen] = useState(false);

    const handleSearchClick = () => {
        if (!apiKey) {
            setIsApiModalOpen(true);
            return;
        }
        executeSearch();
    };

    const isSearching = status === 'uploading' || status === 'analyzing';

    return (
        <div className="relative min-h-screen selection:bg-primary/20 flex flex-col items-center">
            {/* Background Orbs */}
            <div className="bg-orb top-[-10%] left-[-5%] w-[45%] h-[45%] bg-[#6366f1]/5" />
            <div className="bg-orb bottom-[5%] right-[-5%] w-[40%] h-[40%] bg-[#a855f7]/5" />

            <header className="w-full max-w-[1440px] px-8 py-10 flex justify-between items-center z-[60]">
                <div className="text-2xl font-bold tracking-tight text-[#202124] flex items-center gap-1">
                    Kassa<span className="text-[#1A73E8]">Labs</span>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsApiModalOpen(true)}
                        className={cn(
                            "group flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all border shadow-sm",
                            apiKey
                                ? "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"
                                : "bg-[#1A73E8] text-white border-transparent hover:bg-[#1557B0] hover:shadow-lg active:scale-95"
                        )}
                    >
                        <Key className={cn("w-4 h-4", !apiKey && "text-white/80")} />
                        {apiKey ? "Set API Key" : "Activate API Key"}
                    </button>

                    <Link
                        href="/admin"
                        className="p-2.5 rounded-full bg-white border border-slate-100 shadow-sm text-slate-400 hover:text-slate-600 hover:shadow-md transition-all active:scale-90"
                        title="Search Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </Link>
                </div>
            </header>

            <main className="flex-1 w-full max-w-5xl px-6 flex flex-col items-center justify-center -mt-10">
                {/* Hero Section */}
                <section className="text-center space-y-6 mb-12 animate-fade-in">
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-gradient">
                        Inspiration to reality.
                    </h1>
                    <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed font-light">
                        Upload an image and our AI fill find the perfect matches from our furniture catalog.
                    </p>
                </section>

                {/* Central Interaction Card */}
                <section className="w-full max-w-2xl space-y-8 relative z-10">
                    <div className="glass-card p-10 space-y-10 animate-slide-up">
                        <UploadPanel
                            file={image}
                            previewUrl={imagePreview}
                            onFileChange={setImage}
                            error={error?.code === 'MISSING_IMAGE' ? error.message : null}
                        />

                        <PromptInput value={prompt} onChange={setPrompt} />

                        <div className="flex gap-4">
                            <button
                                onClick={handleSearchClick}
                                disabled={isSearching || !image}
                                className="flex-1 py-5 bg-gradient-to-r from-[#6366f1] to-[#60a5fa] text-white font-bold rounded-[1.5rem] hover:shadow-2xl hover:shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:scale-100 flex items-center justify-center text-lg tracking-wide"
                            >
                                {isSearching ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Searching...</span>
                                    </div>
                                ) : "Find Matches"}
                            </button>

                            {(image || prompt || results.length > 0) && (
                                <button
                                    onClick={reset}
                                    className="p-5 bg-white border border-slate-100 text-slate-400 rounded-[1.5rem] hover:bg-slate-50 hover:text-slate-600 transition-all shadow-sm active:scale-95"
                                    title="Reset Search"
                                >
                                    <RotateCcw className="w-6 h-6" />
                                </button>
                            )}
                        </div>

                        {error && error.code !== 'MISSING_IMAGE' && error.code !== 'MISSING_API_KEY' && (
                            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-shake">
                                <p className="font-bold">Search Failed</p>
                                <p className="font-medium opacity-80">{error.message}</p>
                            </div>
                        )}
                    </div>

                    {/* Meta info below card */}
                    {results.length > 0 && (
                        <div className="flex justify-between items-center px-4 animate-fade-in group">
                            <span className="text-sm font-bold text-slate-700">Found {results.length} Matches</span>
                            <button className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors">
                                Sorted by AI Relevance <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </section>

                <ResultsList results={results} status={status} requestId={useSearchController().requestId} />
            </main>

            <footer className="w-full py-16 flex flex-col items-center justify-center animate-fade-in">
                <div className="flex items-center gap-4 group opacity-40 hover:opacity-100 transition-opacity duration-500">
                    <div className="h-px w-24 bg-slate-200" />
                    <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-slate-500 flex items-center gap-2">
                        Kassa Labs <span className="text-slate-300">•</span> Agentic AI
                    </span>
                    <div className="h-px w-24 bg-slate-200" />
                </div>
            </footer>

            <ApiKeyModal
                isOpen={isApiModalOpen}
                onClose={() => setIsApiModalOpen(false)}
                onSave={setApiKey}
                currentKey={apiKey}
            />
        </div>
    );
}
