"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ResultCard } from "./ResultCard";
import { ScoredCandidate } from "@/types/domain";
import { SearchStatus } from "@/hooks/useSearchController";
import { SearchX, Lightbulb } from "lucide-react";

interface ResultsListProps {
    results: ScoredCandidate[];
    status: SearchStatus;
    requestId: string | null;
}

const containerVars = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const itemVars = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function ResultsList({ results, status, requestId }: ResultsListProps) {
    return (
        <AnimatePresence mode="wait">
            {(status === 'uploading' || status === 'analyzing') && (
                <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="w-full py-20 flex flex-col items-center justify-center space-y-8"
                >
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full border-4 border-[#1A73E8]/10 border-t-[#1A73E8] animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <motion.div
                                animate={{ scale: [1, 1.5, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="w-3 h-3 bg-[#1A73E8] rounded-full"
                            />
                        </div>
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-slate-400 font-light">Finding your perfect match in our catalog</p>
                    </div>
                </motion.div>
            )}

            {status === 'empty' && (
                <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full py-20 flex flex-col items-center justify-center text-center space-y-8 bg-white/40 rounded-[3rem] border border-slate-100 my-10"
                >
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
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-50 shadow-sm"
                                >
                                    <Lightbulb className="w-5 h-5 text-indigo-400 shrink-0" />
                                    <span className="text-sm font-medium text-slate-600">{tip}</span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {results.length > 0 && (
                <motion.div
                    key="results"
                    variants={containerVars}
                    initial="hidden"
                    animate="show"
                    className="w-full pt-12 pb-20"
                >
                    <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
                        {results.map((result, index) => (
                            <motion.div key={result.id} variants={itemVars}>
                                <ResultCard
                                    result={result}
                                    rank={index + 1}
                                    requestId={requestId || ''}
                                />
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
