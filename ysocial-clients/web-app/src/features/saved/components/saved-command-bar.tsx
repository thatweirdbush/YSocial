import React, { useState } from "react";
import { FolderHeart, Trash2, X, CheckSquare, Square, ChevronUp } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { Collection } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SavedCommandBarProps {
  selectedCount: number;
  onBulkUnsave: () => void;
  onMoveToCollection: (collectionId: string) => void;
  collections: Collection[];
  onSelectAllToggle: () => void;
  isAllSelected: boolean;
  onClose: () => void;
}

export const SavedCommandBar: React.FC<SavedCommandBarProps> = ({
  selectedCount,
  onBulkUnsave,
  onMoveToCollection,
  collections,
  onSelectAllToggle,
  isAllSelected,
  onClose,
}) => {
  const { t } = useTranslation();
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-950/95 dark:bg-white/95 backdrop-blur-md px-5 py-3 rounded-full shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-zinc-800/40 dark:border-zinc-200/50 flex items-center gap-4 z-50 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
      {/* Selection count */}
      <span className="text-xs font-bold text-zinc-300 dark:text-zinc-700 tracking-tight select-none pr-1.5 border-r border-zinc-800 dark:border-zinc-200">
        {t("saved.selectedCount" as any, { count: selectedCount })?.replace("{{count}}", selectedCount.toString()) || `${selectedCount} selected`}
      </span>

      {/* Select All / Deselect All Toggle button */}
      <button
        onClick={onSelectAllToggle}
        className="flex items-center gap-1.5 py-1 px-2.5 rounded-full hover:bg-zinc-900 dark:hover:bg-zinc-100 text-zinc-400 hover:text-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-900 transition-colors text-[11px] font-bold tracking-tight cursor-pointer"
        title={isAllSelected ? t("saved.deselectAll" as any) || "Deselect All" : t("saved.selectAll" as any) || "Select All"}
      >
        {isAllSelected ? (
          <>
            <CheckSquare className="size-3.5 shrink-0" />
            <span>{t("saved.deselectAll" as any) || "Deselect All"}</span>
          </>
        ) : (
          <>
            <Square className="size-3.5 shrink-0" />
            <span>{t("saved.selectAll" as any) || "Select All"}</span>
          </>
        )}
      </button>

      {/* Move to Collection button */}
      <DropdownMenu open={collectionMenuOpen} onOpenChange={setCollectionMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 py-1 px-3 rounded-full hover:bg-zinc-900 dark:hover:bg-zinc-100 text-zinc-400 hover:text-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-900 transition-colors text-[11px] font-bold tracking-tight cursor-pointer">
            <FolderHeart className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-550" />
            <span>{t("saved.moveToCollection" as any) || "Move to Collection"}</span>
            <ChevronUp className={`size-3 shrink-0 transition-transform duration-250 ${collectionMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="top"
          className="w-48 mb-2 rounded-2xl border-zinc-800 dark:border-zinc-200 bg-zinc-950 dark:bg-white p-2 shadow-2xl z-50 text-zinc-200 dark:text-zinc-800"
        >
          {collections.length === 0 ? (
            <div className="text-[11px] text-zinc-500 py-1.5 px-3 text-center">
              {t("saved.noCollections" as any) || "No collections available"}
            </div>
          ) : (
            collections.map((col) => (
              <DropdownMenuItem
                key={col.id}
                onClick={() => {
                  onMoveToCollection(col.id);
                  setCollectionMenuOpen(false);
                }}
                className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-900 dark:focus:bg-zinc-100 hover:text-white dark:hover:text-black text-xs font-semibold"
              >
                {col.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete / Bulk Unsave button */}
      <button
        onClick={onBulkUnsave}
        className="flex items-center gap-1.5 py-1 px-3 rounded-full bg-red-950/40 hover:bg-red-900/60 dark:bg-red-50/40 dark:hover:bg-red-100/60 text-red-400 dark:text-red-600 hover:text-red-300 dark:hover:text-red-750 transition-colors text-[11px] font-bold tracking-tight cursor-pointer"
      >
        <Trash2 className="size-3.5 shrink-0 text-red-500" />
        <span>{t("saved.deleteSelected" as any) || "Delete Selected"}</span>
      </button>

      {/* Close/Deselect All trigger */}
      <button
        onClick={onClose}
        className="size-6 rounded-full hover:bg-zinc-900 dark:hover:bg-zinc-100 text-zinc-500 dark:text-zinc-400 hover:text-zinc-300 dark:hover:text-zinc-700 transition-colors flex items-center justify-center cursor-pointer shrink-0 ml-1"
        title={t("saved.cancel" as any) || "Cancel"}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};
