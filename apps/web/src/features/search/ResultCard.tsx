import { BadgeCheck, ThumbsUp, ThumbsDown, Package } from "lucide-react";
import { useState } from "react";
import { ScoredCandidate, MatchBand } from "@/types/domain";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/apiClient";

interface ResultCardProps {
    result: ScoredCandidate;
    rank: number;
    requestId: string;
    className?: string;
}

export function ResultCard({ result, rank, requestId, className }: ResultCardProps) {
    const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFeedback = async (rating: 'thumbs_up' | 'thumbs_down') => {
        if (isSubmitting || feedback === rating) return;

        setIsSubmitting(true);
        try {
            await apiClient.submitFeedback(requestId, {
                items: { [result.id]: rating }
            });
            setFeedback(rating);
        } catch (error) {
            console.error("Failed to submit feedback", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const bandColors: Record<MatchBand, string> = {
        [MatchBand.HIGH]: "bg-emerald-50 text-emerald-600 border-emerald-100",
        [MatchBand.MEDIUM]: "bg-amber-50 text-amber-600 border-amber-100",
        [MatchBand.LOW]: "bg-slate-50 text-slate-500 border-slate-100",
    };

    return (
        <div className={cn(
            "group relative bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-500 animate-slide-up",
            className
        )}>
            {/* Rank Badge */}
            <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                {rank}
            </div>

            <div className="flex justify-between items-start gap-4 mb-6 pl-10">
                <div className="space-y-1">
                    <h3 className="text-xl font-bold text-[#202124] leading-tight group-hover:text-primary transition-colors">
                        {result.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                        {result.category} <span className="w-1 h-1 rounded-full bg-slate-200" /> {result.type}
                    </div>
                </div>
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0",
                    bandColors[result.matchBand]
                )}>
                    {result.matchBand} Match
                </div>
            </div>

            <div className="space-y-6">
                <p className="text-slate-500 text-sm leading-relaxed font-light line-clamp-3">
                    {result.description}
                </p>

                <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-50">
                    <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-300 tracking-[0.2em] block">Dimensions</span>
                        <div className="flex items-baseline gap-1 text-slate-600 font-medium tracking-tight">
                            {result.width}<span className="text-[10px] opacity-40">W</span>
                            <span className="opacity-20 mx-0.5">×</span>
                            {result.height}<span className="text-[10px] opacity-40">H</span>
                            <span className="opacity-20 mx-0.5">×</span>
                            {result.depth}<span className="text-[10px] opacity-40">D</span>
                        </div>
                    </div>
                    <div className="space-y-1 text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-300 tracking-[0.2em] block">Price</span>
                        <span className="text-2xl font-bold text-indigo-500">
                            ${result.price.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                    <div className="flex flex-wrap gap-2 flex-1">
                        {result.reasons.slice(0, 2).map((reason, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50/50 text-[10px] font-bold text-indigo-400 border border-indigo-100/30">
                                <BadgeCheck className="w-3.5 h-3.5" />
                                {reason}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 bg-slate-50 rounded-xl p-1 translate-x-1">
                        <button
                            onClick={() => handleFeedback('thumbs_up')}
                            disabled={isSubmitting}
                            className={cn(
                                "p-2 rounded-lg transition-all",
                                feedback === 'thumbs_up'
                                    ? "bg-white shadow-sm text-emerald-500"
                                    : "text-slate-300 hover:text-slate-500"
                            )}
                        >
                            <ThumbsUp className={cn("w-4 h-4", feedback === 'thumbs_up' && "fill-current")} />
                        </button>
                        <button
                            onClick={() => handleFeedback('thumbs_down')}
                            disabled={isSubmitting}
                            className={cn(
                                "p-2 rounded-lg transition-all",
                                feedback === 'thumbs_down'
                                    ? "bg-white shadow-sm text-red-400"
                                    : "text-slate-300 hover:text-red-400"
                            )}
                        >
                            <ThumbsDown className={cn("w-4 h-4", feedback === 'thumbs_down' && "fill-current")} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
