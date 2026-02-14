"use client";

import { ResultCard } from "./ResultCard";
import { ScoredCandidate } from "@/types/domain";
import { SearchStatus } from "@/hooks/useSearchController";
import { Loader2, SearchX, Lightbulb } from "lucide-react";

interface ResultsListProps {
    results: ScoredCandidate[];
    status: SearchStatus;
    requestId: string | null;
}

export function ResultsList({ results, status, requestId }: ResultsListProps) {
    if (status === 'uploading' || status === 'analyzing') {
        return (
            <div className="w-full py-20 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-[#1A73E8]/10 border-t-[#1A73E8] animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-[#1A73E8] rounded-full animate-pulse" />
                    </div>
                </div>
                <div className="text-center space-y-2">
                    <p className="text-2xl font-bold tracking-tight text-[#202124]">
                        {status === 'uploading' ? 'Sending image...' : 'AI is analyzing visuals...'}
                    </p>
                    <p className="text-slate-400 font-light">Finding your perfect match in our catalog</p>
                </div>
            </div>
        );
    }

    if (status === 'empty') {
        return (
            <div className="w-full py-20 flex flex-col items-center justify-center text-center space-y-8 animate-fade-in bg-white/40 rounded-[3rem] border border-slate-100 my-10">
                <div className="p-8 rounded-full bg-slate-50 text-slate-300">
                    <SearchX className="w-16 h-16 stroke-[1]" />
                </div>
                <div className="max-w-md space-y-4 px-6">
                    <h2 className="text-3xl font-bold text-[#202124]">No matches found</h2>
                    <p className="text-slate-500 font-light leading-relaxed">
                        Our AI couldn't find an exact match. Try these tips to improve results:
                    </p>

                    <div className="grid gap-3 text-left pt-4">
                        {[
                            "Use a clearer, well-lit photo",
                            "Focus on a single furniture item",
                            "Remove restrictive keywords from the prompt",
                        ].map((tip, i) => (
                            <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-50 shadow-sm">
                                <Lightbulb className="w-5 h-5 text-indigo-400 shrink-0" />
                                <span className="text-sm font-medium text-slate-600">{tip}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (results.length === 0 && status !== 'error' && status !== 'idle') {
        return null;
    }

    return (
        <div className="w-full pt-12 pb-20 animate-fade-in">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-2">
                {results.map((result, index) => (
                    <ResultCard
                        key={result.id}
                        result={result}
                        rank={index + 1}
                        requestId={requestId || ''}
                    />
                ))}
            </div>
        </div>
    );
}
