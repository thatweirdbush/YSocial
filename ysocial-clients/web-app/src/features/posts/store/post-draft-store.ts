import { create } from "zustand";
import type { PostAudience, PostDraft, PostVisibility } from "../types";

interface DraftState {
  drafts: PostDraft[];
  actions: {
    saveDraft: (content: string, images: string[], audience: PostAudience, id?: string, visibility?: PostVisibility) => string;
    deleteDraft: (id: string) => void;
    clearDrafts: () => void;
  };
}

export const useDraftStore = create<DraftState>((set) => {
  let initialDrafts: PostDraft[] = [];
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("ysocial_post_drafts");
      if (saved) {
        initialDrafts = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse drafts", e);
    }
  }

  return {
    drafts: initialDrafts,
    actions: {
      saveDraft: (content, images, audience, id, visibility) => {
        const generatedId = id || Math.random().toString(36).substring(2, 9);
        set((state) => {
          const newDrafts = [...state.drafts];
          const existingIndex = newDrafts.findIndex((d) => d.id === generatedId);

          if (existingIndex !== -1) {
            newDrafts[existingIndex] = {
              id: generatedId,
              content,
              images,
              audience,
              ...(visibility === "closeFriends" ? { visibility } : {}),
              createdAt: Date.now(),
            };
          } else {
            newDrafts.unshift({
              id: generatedId,
              content,
              images,
              audience,
              ...(visibility === "closeFriends" ? { visibility } : {}),
              createdAt: Date.now(),
            });
          }

          if (typeof window !== "undefined") {
            localStorage.setItem("ysocial_post_drafts", JSON.stringify(newDrafts));
          }
          return { drafts: newDrafts };
        });
        return generatedId;
      },
      deleteDraft: (id) => {
        set((state) => {
          const newDrafts = state.drafts.filter((d) => d.id !== id);
          if (typeof window !== "undefined") {
            localStorage.setItem("ysocial_post_drafts", JSON.stringify(newDrafts));
          }
          return { drafts: newDrafts };
        });
      },
      clearDrafts: () => {
        set(() => {
          if (typeof window !== "undefined") {
            localStorage.removeItem("ysocial_post_drafts");
          }
          return { drafts: [] };
        });
      },
    },
  };
});

export const useDrafts = () => useDraftStore((state) => state.drafts);
export const useDraftActions = () => useDraftStore((state) => state.actions);
