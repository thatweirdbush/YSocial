"use client";

import React, { useState, useTransition } from "react";
import { Search, FolderPlus, Plus, Bookmark, Sliders, CheckSquare, Layers, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";
import { SavedItem, Collection } from "../types";
import { getMockPostById, PostCard } from "@/features/posts";
import { SavedCommandBar } from "./saved-command-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Saved items reference the shared post mocks so cards open real threads (/posts/[id]).
const SAVED_SEED: { id: string; postId: string; collectionIds: string[]; savedAt: string }[] = [
  { id: "save-1", postId: "post-002", collectionIds: ["col-1"], savedAt: "2026-05-30T10:00:00Z" },
  { id: "save-2", postId: "post-006", collectionIds: ["col-2"], savedAt: "2026-05-29T14:22:00Z" },
  { id: "save-3", postId: "post-010", collectionIds: ["col-3"], savedAt: "2026-05-28T08:15:00Z" },
];

const INITIAL_SAVED_ITEMS: SavedItem[] = SAVED_SEED.flatMap(({ postId, ...item }) => {
  const post = getMockPostById(postId);
  return post ? [{ ...item, post }] : [];
});

export const SavedList: React.FC = () => {
  const { t } = useTranslation();
  const [, startTransition] = useTransition();

  // 1. Initial Mock Collections
  const [collections, setCollections] = useState<Collection[]>([
    { id: "col-1", name: "Design System", slug: "design-system" },
    { id: "col-2", name: "Gen Z Culture", slug: "gen-z-culture" },
    { id: "col-3", name: "Next.js 16", slug: "nextjs-16" },
  ]);

  // 2. Master Array of Saved Items
  const [savedItems, setSavedItems] = useState<SavedItem[]>(INITIAL_SAVED_ITEMS);

  // UI Interactive States
  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isManageMode, setIsManageMode] = useState<boolean>(false);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [showAddCollection, setShowAddCollection] = useState<boolean>(false);
  const [collectionToDelete, setCollectionToDelete] = useState<{ id: string; name: string } | null>(null);

  // Scroll Indicators
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);

  // Search input focus Ref
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Scroll Ref for horizontal tags scroll
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Scroll visibility check function
  const checkScroll = React.useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 1);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  // Listen scroll event
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      // Initial check
      checkScroll();

      const observer = new ResizeObserver(checkScroll);
      observer.observe(container);

      return () => {
        container.removeEventListener("scroll", checkScroll);
        observer.disconnect();
      };
    }
  }, [collections, showAddCollection, checkScroll]);

  // Effect to auto-scroll horizontal tags bar on showing add input
  React.useEffect(() => {
    if (showAddCollection && scrollContainerRef.current) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          left: scrollContainerRef.current.scrollWidth,
          behavior: "smooth",
        });
        checkScroll();
      }, 100);
    }
  }, [showAddCollection, checkScroll]);

  // Animation Track States (Unsave slide-out tracker)
  const [animatingUnsaveIds, setAnimatingUnsaveIds] = useState<string[]>([]);

  // Drag and Drop drag tracker
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);

  // 3. Client Filtered List (For display only)
  const filteredItems = savedItems.filter((item) => {
    // Match active collection tag
    const matchesCollection =
      activeCollectionId === "all" || item.collectionIds.includes(activeCollectionId);

    // Match Search query
    const content = item.post.content.toLowerCase();
    const displayName = item.post.user.displayName.toLowerCase();
    const username = item.post.user.username.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = content.includes(query) || displayName.includes(query) || username.includes(query);

    return matchesCollection && matchesSearch;
  });

  // 4. Create New Collection Handler
  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    const slug = newCollectionName.toLowerCase().trim().replace(/\s+/g, "-");
    if (collections.some((col) => col.slug === slug)) {
      toast.error(t("saved.collectionExists" as any) || "Collection already exists!");
      return;
    }

    const newCol: Collection = {
      id: `col-${Date.now()}`,
      name: newCollectionName.trim(),
      slug,
    };

    setCollections((prev) => [...prev, newCol]);
    setNewCollectionName("");
    setShowAddCollection(false);
    toast.success(t("saved.collectionAddedSuccess" as any) || "Collection created successfully!");
  };

  const handleDeleteCollection = (id: string, name: string) => {
    setCollectionToDelete({ id, name });
  };

  const confirmDeleteCollection = (id: string) => {
    setCollections((prev) => prev.filter((col) => col.id !== id));
    // Remove the collection relation from any items that belong to it
    setSavedItems((prev) =>
      prev.map((item) => {
        if (item.collectionIds.includes(id)) {
          return { ...item, collectionIds: item.collectionIds.filter((cid) => cid !== id) };
        }
        return item;
      })
    );

    if (activeCollectionId === id) {
      setActiveCollectionId("all");
    }

    setCollectionToDelete(null);
    toast.success(t("saved.collectionDeletedSuccess" as any) || "Collection deleted successfully!");
  };

  // 5. Unsave / Slide-Out Optimistic trigger
  const handleUnsaveOptimistic = (id: string) => {
    // Add to animating list first
    setAnimatingUnsaveIds((prev) => [...prev, id]);

    // Perform state cleanup after animation delay (300ms)
    setTimeout(() => {
      startTransition(() => {
        setSavedItems((prev) => prev.filter((item) => item.id !== id));
        setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
        setAnimatingUnsaveIds((prev) => prev.filter((animId) => animId !== id));
      });
      toast.success(t("saved.unsaveSuccess" as any) || "Item unsaved successfully!");
    }, 300);
  };

  // 6. Bulk Unsave trigger
  const handleBulkUnsave = () => {
    if (selectedIds.length === 0) return;

    const idsToUnsave = [...selectedIds];
    // Start height animation for all selected targets simultaneously
    setAnimatingUnsaveIds((prev) => [...prev, ...idsToUnsave]);

    setTimeout(() => {
      startTransition(() => {
        setSavedItems((prev) => prev.filter((item) => !idsToUnsave.includes(item.id)));
        setSelectedIds([]);
        setIsManageMode(false);
        setAnimatingUnsaveIds((prev) => prev.filter((id) => !idsToUnsave.includes(id)));
      });
      toast.success(t("saved.bulkUnsaveSuccess" as any) || "Selected items unsaved successfully!");
    }, 300);
  };

  // 7. Bulk Move to Collection
  const handleBulkMoveToCollection = (collectionId: string) => {
    if (selectedIds.length === 0) return;

    setSavedItems((prev) =>
      prev.map((item) => {
        if (selectedIds.includes(item.id)) {
          // Add collection relation if not already exists
          const newIds = item.collectionIds.includes(collectionId)
            ? item.collectionIds
            : [...item.collectionIds, collectionId];
          return { ...item, collectionIds: newIds };
        }
        return item;
      })
    );

    const targetCol = collections.find((c) => c.id === collectionId);
    toast.success(
      t("saved.movedSuccess" as any) || `Successfully moved to collection ${targetCol?.name || ""}`
    );
    setSelectedIds([]);
    setIsManageMode(false);
  };

  // 8. Bulk Selection toggles
  const handleSelectAllToggle = () => {
    const activeIds = filteredItems.map((item) => item.id);
    const allSelected = activeIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      // Remove all active IDs
      setSelectedIds((prev) => prev.filter((id) => !activeIds.includes(id)));
    } else {
      // Add all active IDs
      setSelectedIds((prev) => Array.from(new Set([...prev, ...activeIds])));
    }
  };

  const handleRowSelectToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 9. Master Array Reorder Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain") || draggedItemId;
    if (!draggedId || draggedId === targetId) {
      setDraggedItemId(null);
      return;
    }

    setSavedItems((prevItems) => {
      // Check indices directly inside Master Array to fulfill strict drag requirement
      const dragIndex = prevItems.findIndex((item) => item.id === draggedId);
      const dropIndex = prevItems.findIndex((item) => item.id === targetId);

      if (dragIndex === -1 || dropIndex === -1) return prevItems;

      const updatedMaster = [...prevItems];
      const [removed] = updatedMaster.splice(dragIndex, 1);
      updatedMaster.splice(dropIndex, 0, removed);
      return updatedMaster;
    });

    setDraggedItemId(null);
  };

  // 10. Collection Tags Reorder Drag and Drop Handlers
  const handleColDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCollectionId(id);
    e.dataTransfer.setData("text/plain/col", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleColDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain/col") || draggedCollectionId;
    if (!draggedId || draggedId === targetId) {
      setDraggedCollectionId(null);
      return;
    }

    setCollections((prevCols) => {
      const dragIndex = prevCols.findIndex((col) => col.id === draggedId);
      const dropIndex = prevCols.findIndex((col) => col.id === targetId);

      if (dragIndex === -1 || dropIndex === -1) return prevCols;

      const updated = [...prevCols];
      const [removed] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, removed);
      return updated;
    });

    setDraggedCollectionId(null);
  };

  return (
    <div className="flex flex-col w-full min-h-screen pb-24 relative select-none">
      {/* Sticky Header */}
      <header className="sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-20 pt-3.5 px-4 flex items-center justify-between gap-3">
        {/* Left Side: Title */}
        <h1 className={`text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 transition-all duration-300
          }`}>
          {t("saved.title" as any) || "Saved"}
        </h1>

        {/* Right Side Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Expandable Search Area */}
          <div className="flex items-center relative transition-all duration-300">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("saved.search" as any) || "Search..."}
              className={`bg-zinc-100 dark:bg-zinc-900 border-none rounded-full px-3 py-1.5 text-xs outline-none focus:ring-0 text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-650 transition-all duration-300 origin-right
                ${isSearchExpanded ? "w-44 sm:w-64 mr-1 opacity-100" : "w-0 opacity-0 pointer-events-none p-0"
                }`}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsSearchExpanded(false);
                  setSearchQuery("");
                }
              }}
            />
            <button
              onClick={() => {
                const expanded = !isSearchExpanded;
                setIsSearchExpanded(expanded);
                if (expanded) {
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 50);
                } else {
                  setSearchQuery(""); // Clear search query when collapsing
                }
              }}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
            >
              {isSearchExpanded ? <X className="size-4 shrink-0" /> : <Search className="size-4 shrink-0" />}
            </button>
          </div>

          {/* Manage Mode trigger */}
          <button
            onClick={() => {
              const nextMode = !isManageMode;
              setIsManageMode(nextMode);
              if (!nextMode) {
                setSelectedIds([]); // Clean state on closing checkboxes
              }
            }}
            disabled={filteredItems.length === 0}
            className={`px-3 py-1.5 rounded-full border text-xs font-bold tracking-tight cursor-pointer transition-all duration-300 ${filteredItems.length === 0
              ? "opacity-30 cursor-not-allowed border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-650"
              : isManageMode
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black dark:border-white"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950"
              }`}
          >
            {isManageMode ? t("saved.exitManage" as any) || "Exit" : t("saved.manageMode" as any) || "Manage"}
          </button>
        </div>
      </header>

      <div className="px-0 py-4 h-16 overflow-hidden relative flex items-center w-full group/scroll">
        {/* Left Gradient Overlay */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-white via-white/80 to-transparent dark:from-black dark:via-black/80 transition-opacity duration-300 ${canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
        />

        {/* Left Scroll Indicator Chevron */}
        <button
          onClick={() => {
            scrollContainerRef.current?.scrollBy({ left: -180, behavior: "smooth" });
          }}
          className={`absolute left-2 z-20 size-7 rounded-full bg-white/90 dark:bg-black/90 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center text-zinc-650 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 transition-all duration-300 hover:scale-105 cursor-pointer backdrop-blur-sm shrink-0 ${canScrollLeft ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
            }`}
          title="Scroll Left"
        >
          <ChevronLeft className="size-4 shrink-0" />
        </button>

        {/* Collections filter tags bar */}
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full px-5 scroll-smooth"
        >
          {/* Default "All" pill */}
          <button
            onClick={() => setActiveCollectionId("all")}
            className={`h-8 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap tracking-tight transition-all duration-300 cursor-pointer border flex items-center justify-center shrink-0 ${activeCollectionId === "all"
              ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-black dark:border-white"
              : "bg-transparent border-zinc-150 dark:border-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-450 dark:hover:border-zinc-700"
              }`}
          >
            {t("saved.all" as any) || "All"}
          </button>

          {/* Collection lists */}
          {collections.map((col) => {
            const isDragging = draggedCollectionId === col.id;
            return (
              <div
                key={col.id}
                draggable
                onDragStart={(e) => handleColDragStart(e, col.id)}
                onDragOver={handleColDragOver}
                onDrop={(e) => handleColDrop(e, col.id)}
                className={`relative group/pill shrink-0 flex items-center h-8 cursor-grab active:cursor-grabbing transition-all duration-200 ${isDragging ? "opacity-35 scale-95" : "opacity-100"
                  }`}
                title="Drag to reorder collection tag"
              >
                <button
                  onClick={() => setActiveCollectionId(col.id)}
                  className={`h-8 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap tracking-tight transition-all duration-300 border flex items-center justify-center shrink-0 pr-7 ${activeCollectionId === col.id
                    ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-black dark:border-white"
                    : "bg-transparent border-zinc-150 dark:border-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-450 dark:hover:border-zinc-700"
                    }`}
                >
                  {col.name}
                </button>

                {/* Delete button positioned absolute inside the pill */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCollection(col.id, col.name);
                  }}
                  className={`absolute right-2 size-3.5 rounded-full flex items-center justify-center transition-colors cursor-pointer select-none ${activeCollectionId === col.id
                    ? "text-zinc-400 hover:text-white hover:bg-zinc-800"
                    : "text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  title="Delete Collection"
                >
                  <X className="size-2.5 shrink-0" />
                </button>
              </div>
            );
          })}

          {/* Inline Add Collection Toggle pill */}
          {showAddCollection ? (
            <form onSubmit={handleCreateCollection} className="flex items-center gap-1.5 shrink-0 h-8">
              <input
                type="text"
                autoFocus
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowAddCollection(false);
                    setNewCollectionName("");
                  }
                }}
                placeholder={t("saved.collectionNamePlaceholder" as any) || "New..."}
                className="h-8 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1 text-xs outline-none focus:border-zinc-950 dark:focus:border-zinc-100 text-zinc-900 dark:text-zinc-100"
              />
              <button
                type="submit"
                className="h-8 px-3 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center font-bold text-xs tracking-tight transition-all cursor-pointer shrink-0"
              >
                <Plus className="size-3.5 mr-1" />
                <span>{t("saved.create" as any) || "Create"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddCollection(false)}
                className="h-8 px-3 border border-zinc-150 dark:border-zinc-900 rounded-full flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:border-red-500/30 transition-colors cursor-pointer shrink-0"
              >
                {t("saved.cancel" as any) || "Cancel"}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAddCollection(true)}
              className="h-8 flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-800 text-zinc-400 dark:text-zinc-650 hover:text-zinc-800 dark:hover:text-zinc-350 hover:border-zinc-600 dark:hover:border-zinc-600 transition-colors text-xs font-semibold whitespace-nowrap tracking-tight cursor-pointer shrink-0"
            >
              <FolderPlus className="size-3.5 shrink-0" />
              <span>{t("saved.createCollection" as any) || "New"}</span>
            </button>
          )}
        </div>

        {/* Right Gradient Overlay */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-white via-white/80 to-transparent dark:from-black dark:via-black/80 transition-opacity duration-300 ${canScrollRight ? "opacity-100" : "opacity-0"
            }`}
        />

        {/* Right Scroll Indicator Chevron */}
        <button
          onClick={() => {
            scrollContainerRef.current?.scrollBy({ left: 180, behavior: "smooth" });
          }}
          className={`absolute right-2 z-20 size-7 rounded-full bg-white/90 dark:bg-black/90 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-center text-zinc-650 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 transition-all duration-300 hover:scale-105 cursor-pointer backdrop-blur-sm shrink-0 ${canScrollRight ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
            }`}
          title="Scroll Right"
        >
          <ChevronRight className="size-4 shrink-0" />
        </button>
      </div>

      {/* Main Items feed rendering */}
      <div className="flex-1 w-full flex flex-col border-t border-zinc-100 dark:border-zinc-900/60 select-none">
        {filteredItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6 text-center select-none">
            <Layers className="size-12 text-zinc-300 dark:text-zinc-800 mb-4 stroke-1 animate-pulse" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {t("saved.emptyTitle" as any) || "No saved items found"}
            </h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 max-w-xs mt-1.5 leading-relaxed">
              {t("saved.emptyDesc" as any) || "Start saving posts from your timeline feed to display them here!"}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isUnsaving = animatingUnsaveIds.includes(item.id);
            const isSelected = selectedIds.includes(item.id);
            const isDragging = draggedItemId === item.id;

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item.id)}
                className={`flex w-full items-start transition-all duration-300 border-b border-zinc-100 dark:border-zinc-900/60 ${isUnsaving
                  ? "max-h-0 opacity-0 translate-x-[50px] overflow-hidden py-0 border-none pointer-events-none"
                  : "max-h-[800px] opacity-100 translate-x-0"
                  } ${isDragging ? "opacity-30 bg-zinc-50 dark:bg-zinc-950/40" : ""}`}
              >
                {/* Drag-and-drop indicator bar handle */}
                <div
                  className="w-1.5 self-stretch cursor-grab hover:bg-zinc-300 dark:hover:bg-zinc-800 flex items-center justify-center group/grab select-none shrink-0"
                  title={t("saved.dragToSort" as any) || "Drag to sort items"}
                >
                  <div className="w-[2px] h-8 bg-zinc-200 dark:bg-zinc-900 group-hover/grab:bg-zinc-400 rounded-full" />
                </div>

                {/* Left Side Bulk selection Checkbox */}
                <div
                  className={`flex items-center justify-center py-4 transition-all duration-300 overflow-hidden shrink-0 ${isManageMode ? "w-10 opacity-100 px-1" : "w-0 opacity-0 pointer-events-none"
                    }`}
                >
                  <button
                    onClick={() => handleRowSelectToggle(item.id)}
                    className="size-5 rounded-md border border-zinc-300 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-950 cursor-pointer select-none transition-colors"
                  >
                    {isSelected && <div className="size-2.5 rounded-sm bg-zinc-950 dark:bg-white" />}
                  </button>
                </div>

                {/* Core Post Card Container */}
                <div className="flex-1 min-w-0">
                  <PostCard
                    post={item.post}
                    isSavedPage={true}
                    onUnsave={() => handleUnsaveOptimistic(item.id)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Utility Command Bar */}
      <SavedCommandBar
        selectedCount={selectedIds.length}
        onBulkUnsave={handleBulkUnsave}
        onMoveToCollection={handleBulkMoveToCollection}
        collections={collections}
        isAllSelected={
          filteredItems.length > 0 &&
          filteredItems.map((item) => item.id).every((id) => selectedIds.includes(id))
        }
        onSelectAllToggle={handleSelectAllToggle}
        onClose={() => {
          setSelectedIds([]);
          setIsManageMode(false); // Make sure checkboxes are smoothly closed as well
        }}
      />

      {/* Delete Collection Confirmation Dialog */}
      <Dialog open={collectionToDelete !== null} onOpenChange={(isOpen) => !isOpen && setCollectionToDelete(null)}>
        <DialogContent
          showCloseButton={false}
          className="w-[340px] p-6 rounded-3xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-center flex flex-col items-center gap-4 z-[100] animate-in fade-in zoom-in duration-200"
        >
          <DialogHeader className="flex flex-col items-center gap-3 w-full">
            <div className="size-12 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center text-red-500 mx-auto shrink-0">
              <FolderPlus className="size-6 stroke-1.5" />
            </div>
            <DialogTitle className="text-md font-semibold text-zinc-900 dark:text-zinc-50 leading-tight mx-auto">
              {collectionToDelete
                ? (t("saved.deleteCollectionConfirmTitle" as any)?.replace("{name}", collectionToDelete.name) || `Delete "${collectionToDelete.name}" collection?`)
                : "Delete collection?"}
            </DialogTitle>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 max-w-xs mt-1 leading-relaxed mx-auto">
              {t("saved.deleteCollectionConfirmDesc" as any) || "This will delete the collection permanently. Saved items inside this collection will not be deleted."}
            </p>
          </DialogHeader>
          <div className="w-full flex flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setCollectionToDelete(null)}
              className="w-full flex-1 rounded-2xl font-bold bg-transparent border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-none h-10 flex items-center justify-center"
            >
              {t("saved.cancel" as any) || "Cancel"}
            </Button>
            <Button
              onClick={() => {
                if (collectionToDelete) {
                  confirmDeleteCollection(collectionToDelete.id);
                }
              }}
              className="w-full flex-1 rounded-2xl font-bold bg-red-500 hover:bg-red-650 text-white border-none shadow-none h-10 flex items-center justify-center cursor-pointer"
            >
              {t("saved.delete" as any) || "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
