"use client";

import React, { useState, useTransition } from "react";
import { Search, FolderPlus, Plus, Bookmark, Sliders, CheckSquare, Layers } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { toast } from "sonner";
import { SavedItem, Collection } from "../types";
import { PostCard } from "@/features/posts";
import { SavedCommandBar } from "./saved-command-bar";

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
  const [savedItems, setSavedItems] = useState<SavedItem[]>([
    {
      id: "save-1",
      savedAt: "2026-05-30T10:00:00Z",
      collectionIds: ["col-1"],
      post: {
        id: "post-101",
        content: "Luxury Minimalist is the new supreme standard. Threads-inspired Zinc palettes, ultra-thin border layouts, and dynamic motion states make interfaces feel truly alive. #design #uipro",
        createdAt: "2026-05-30T09:00:00Z",
        likesCount: 124,
        commentsCount: 18,
        isLikedByCurrentUser: true,
        isBookmarkedByCurrentUser: true,
        user: {
          id: "usr-1",
          displayName: "Alex Rivera",
          username: "alexr_design",
          avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
          isVerified: true,
        },
      },
    },
    {
      id: "save-2",
      savedAt: "2026-05-29T14:22:00Z",
      collectionIds: ["col-2"],
      post: {
        id: "post-102",
        content: "If your app takes more than 100ms to react to a user touch gesture, you have failed them. Optimistic UI states paired with micro-animations aren't optional anymore, they are mandatory requirements. ⚡️",
        createdAt: "2026-05-29T13:00:00Z",
        likesCount: 98,
        commentsCount: 9,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: true,
        user: {
          id: "usr-2",
          displayName: "Emma Watson",
          username: "emma_dev",
          avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
          isVerified: false,
        },
      },
    },
    {
      id: "save-3",
      savedAt: "2026-05-28T08:15:00Z",
      collectionIds: ["col-3"],
      post: {
        id: "post-103",
        content: "Next.js 16 + React 19 Server Components are completely changing the mental model. Zero client bundle overhead for static portions combined with ultra-light dynamic components is absolute magic.",
        createdAt: "2026-05-28T07:30:00Z",
        likesCount: 230,
        commentsCount: 45,
        isLikedByCurrentUser: true,
        isBookmarkedByCurrentUser: true,
        user: {
          id: "usr-3",
          displayName: "Devon Lane",
          username: "devon_codes",
          avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
          isVerified: true,
        },
      },
    },
  ]);

  // UI Interactive States
  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isManageMode, setIsManageMode] = useState<boolean>(false);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [showAddCollection, setShowAddCollection] = useState<boolean>(false);

  // Animation Track States (Unsave slide-out tracker)
  const [animatingUnsaveIds, setAnimatingUnsaveIds] = useState<string[]>([]);

  // Drag and Drop drag tracker
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col w-full min-h-screen pb-24 relative select-none">
      {/* Sticky Header */}
      <header className="sticky top-0 bg-white/80 dark:bg-black/80 backdrop-blur-md z-20 border-b border-zinc-150 dark:border-zinc-900 py-3.5 px-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("saved.title" as any) || "Saved"}
        </h1>

        {/* Manage Mode trigger */}
        <button
          onClick={() => {
            const nextMode = !isManageMode;
            setIsManageMode(nextMode);
            if (!nextMode) {
              setSelectedIds([]); // Clean state on closing checkboxes
            }
          }}
          className={`px-3 py-1.5 rounded-full border text-xs font-bold tracking-tight cursor-pointer transition-all duration-300 ${isManageMode
            ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black dark:border-white"
            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950"
            }`}
        >
          {isManageMode ? t("saved.exitManage" as any) || "Exit" : t("saved.manageMode" as any) || "Manage"}
        </button>
      </header>

      <div className="px-4 mt-4">
        {/* Local Search Input */}
        <div className="relative w-full flex items-center mb-4 border-b border-zinc-150 dark:border-zinc-900 focus-within:border-zinc-950 dark:focus-within:border-zinc-200 transition-colors">
          <Search className="size-4 text-zinc-400 dark:text-zinc-600 absolute left-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("saved.searchPlaceholder" as any) || "Search saved items..."}
            className="bg-transparent border-none w-full pl-7 py-2.5 text-sm outline-none focus:outline-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          />
        </div>

        {/* Collections filter tags bar */}
        <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar mb-2">
          {/* Default "All" pill */}
          <button
            onClick={() => setActiveCollectionId("all")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap tracking-tight transition-all duration-300 cursor-pointer border ${activeCollectionId === "all"
              ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-black dark:border-white"
              : "bg-transparent border-zinc-150 dark:border-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-450 dark:hover:border-zinc-700"
              }`}
          >
            {t("saved.all" as any) || "All"}
          </button>

          {/* Collection lists */}
          {collections.map((col) => (
            <button
              key={col.id}
              onClick={() => setActiveCollectionId(col.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap tracking-tight transition-all duration-300 cursor-pointer border ${activeCollectionId === col.id
                ? "bg-zinc-950 text-white border-zinc-950 dark:bg-white dark:text-black dark:border-white"
                : "bg-transparent border-zinc-150 dark:border-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-450 dark:hover:border-zinc-700"
                }`}
            >
              {col.name}
            </button>
          ))}

          {/* Inline Add Collection Toggle pill */}
          {showAddCollection ? (
            <form onSubmit={handleCreateCollection} className="flex items-center gap-1.5 shrink-0">
              <input
                type="text"
                autoFocus
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder={t("saved.collectionNamePlaceholder" as any) || "New..."}
                className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1 text-xs outline-none focus:border-zinc-950 dark:focus:border-zinc-100 text-zinc-900 dark:text-zinc-100"
              />
              <button type="submit" className="size-6 bg-zinc-900 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center cursor-pointer shrink-0">
                <Plus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowAddCollection(false)}
                className="text-[10px] font-bold text-zinc-400 dark:text-zinc-650 hover:text-red-500 px-1 transition-colors cursor-pointer shrink-0"
              >
                {t("saved.cancel" as any) || "Cancel"}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAddCollection(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-350 hover:border-zinc-600 dark:hover:border-zinc-600 transition-colors text-xs font-semibold whitespace-nowrap tracking-tight cursor-pointer"
            >
              <FolderPlus className="size-3.5 shrink-0" />
              <span>{t("saved.createCollection" as any) || "New"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Items feed rendering */}
      <div className="flex-1 w-full flex flex-col border-t border-zinc-100 dark:border-zinc-900/60 mt-1 select-none">
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
    </div>
  );
};
