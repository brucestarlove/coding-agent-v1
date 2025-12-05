/**
 * PlansSheet - Slide-down panel for browsing and managing plans
 * Similar to SessionSheet but for plan files
 */

import React, { useState } from 'react';
import { useAgentStore, type PlanSummary, type Plan } from '../store/useAgentStore';

/**
 * Plans sheet component - slides down from top when open
 */
export function PlansSheet() {
  const isOpen = useAgentStore((state) => state.isPlansSheetOpen);
  const plans = useAgentStore((state) => state.plans);
  const setPlansSheetOpen = useAgentStore((state) => state.setPlansSheetOpen);
  const loadPlan = useAgentStore((state) => state.loadPlan);
  const deletePlan = useAgentStore((state) => state.deletePlan);
  const usePlanForImplement = useAgentStore((state) => state.usePlanForImplement);

  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [loadedPlan, setLoadedPlan] = useState<Plan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Handle plan expand/collapse
  const handleToggleExpand = async (filename: string) => {
    if (expandedPlan === filename) {
      setExpandedPlan(null);
      setLoadedPlan(null);
    } else {
      setExpandedPlan(filename);
      const plan = await loadPlan(filename);
      setLoadedPlan(plan);
    }
  };

  // Handle use plan for implement
  const handleUsePlan = (plan: Plan) => {
    usePlanForImplement(plan);
  };

  // Handle delete plan
  const handleDeletePlan = async (filename: string) => {
    await deletePlan(filename);
    setConfirmDelete(null);
    if (expandedPlan === filename) {
      setExpandedPlan(null);
      setLoadedPlan(null);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get icon for plan type
  const getTypeIcon = (type: PlanSummary['type']) => {
    switch (type) {
      case 'implementation':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        );
      case 'research':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        );
    }
  };

  // Get color for plan type
  const getTypeColor = (type: PlanSummary['type']) => {
    switch (type) {
      case 'implementation':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'research':
        return 'text-cyan-400 bg-cyan-500/20';
      default:
        return 'text-violet-400 bg-violet-500/20';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={() => setPlansSheetOpen(false)}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 top-0 z-50 animate-slide-down">
        <div className="max-w-4xl mx-auto m-4">
          <div className="bg-[hsl(222,84%,6%)] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Saved Plans</h2>
                  <p className="text-xs text-white/50">{plans.length} plan{plans.length !== 1 ? 's' : ''} in .codepilot/plans/</p>
                </div>
              </div>
              <button
                onClick={() => setPlansSheetOpen(false)}
                className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Plans List */}
            <div className="max-h-[60vh] overflow-y-auto">
              {plans.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="text-white/50 mb-2">No plans saved yet</p>
                  <p className="text-xs text-white/30">
                    Use "Create Plan" command to generate and save implementation plans
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {plans.map((plan) => (
                    <div key={plan.filePath} className="group">
                      {/* Plan Header */}
                      <div 
                        className="px-6 py-4 hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => handleToggleExpand(plan.filePath)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Type icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getTypeColor(plan.type)}`}>
                            {getTypeIcon(plan.type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium text-white truncate">
                                {plan.title}
                              </h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getTypeColor(plan.type)}`}>
                                {plan.type}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 line-clamp-2 mb-2">
                              {plan.preview}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-white/40">
                              <span>{formatDate(plan.updatedAt)}</span>
                              <span className="font-mono">{plan.filePath}</span>
                              {plan.tags.length > 0 && (
                                <span className="flex gap-1">
                                  {plan.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 rounded bg-white/5">
                                      {tag}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand indicator */}
                          <div className="flex-shrink-0">
                            <svg 
                              width="16" 
                              height="16" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                              className={`text-white/30 transition-transform ${expandedPlan === plan.filePath ? 'rotate-180' : ''}`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {expandedPlan === plan.filePath && loadedPlan && (
                        <div className="px-6 pb-4 animate-fade-in">
                          {/* Plan content preview */}
                          <div className="bg-black/30 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                            <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono">
                              {loadedPlan.content.slice(0, 2000)}
                              {loadedPlan.content.length > 2000 && '...'}
                            </pre>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUsePlan(loadedPlan);
                              }}
                              className="
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm
                                bg-violet-500/20 border border-violet-500/30
                                text-violet-200 hover:text-white hover:bg-violet-500/30
                                transition-colors
                              "
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              Implement This Plan
                            </button>

                            {confirmDelete === plan.filePath ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePlan(plan.filePath);
                                  }}
                                  className="
                                    px-4 py-2 rounded-lg text-sm
                                    bg-pink-500/20 border border-pink-500/30
                                    text-pink-200 hover:text-white hover:bg-pink-500/30
                                    transition-colors
                                  "
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(null);
                                  }}
                                  className="
                                    px-4 py-2 rounded-lg text-sm
                                    bg-white/5 border border-white/10
                                    text-white/50 hover:text-white hover:bg-white/10
                                    transition-colors
                                  "
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(plan.filePath);
                                }}
                                className="
                                  px-4 py-2 rounded-lg text-sm
                                  bg-white/5 border border-white/10
                                  text-white/50 hover:text-pink-300 hover:bg-pink-500/10 hover:border-pink-500/30
                                  transition-colors
                                "
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/10 bg-white/5">
              <p className="text-xs text-white/40">
                Plans are saved as markdown files in your project's .codepilot/plans/ directory
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

