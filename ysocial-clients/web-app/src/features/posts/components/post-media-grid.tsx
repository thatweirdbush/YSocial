"use client";

interface PostMediaGridProps {
  images: string[];
  onOpen: (index: number) => void;
}

/** Multi-image grid matching Threads/X layouts (1, 2, 3, 4+ images). */
export function PostMediaGrid({ images, onOpen }: PostMediaGridProps) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div
        onClick={() => onOpen(0)}
        className="mt-2 rounded-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/40 max-h-[350px] w-full bg-zinc-150 dark:bg-zinc-900 flex items-center justify-center relative shadow-sm cursor-zoom-in transition-all duration-300"
      >
        <img
          src={images[0]}
          alt="Post attachment"
          className="w-full h-full object-cover max-h-[350px] transition-transform duration-700 hover:scale-101"
          loading="lazy"
        />
      </div>
    );
  }

  if (images.length === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl overflow-hidden max-h-[280px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
        {images.map((img, idx) => (
          <div
            key={idx}
            onClick={() => onOpen(idx)}
            className="w-full h-full min-h-[160px] max-h-[280px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
          >
            <img
              src={img}
              alt={`Attachment ${idx + 1}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
            />
          </div>
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl overflow-hidden max-h-[320px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
        <div
          onClick={() => onOpen(0)}
          className="w-full h-full min-h-[240px] max-h-[320px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img row-span-2"
        >
          <img
            src={images[0]}
            alt="Attachment 1"
            className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
          />
        </div>
        <div className="grid grid-rows-2 gap-1.5 h-full">
          {images.slice(1, 3).map((img, idx) => (
            <div
              key={idx}
              onClick={() => onOpen(idx + 1)}
              className="w-full h-full min-h-[110px] max-h-[155px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
            >
              <img
                src={img}
                alt={`Attachment ${idx + 2}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4 or more images grid configuration
  return (
    <div className="mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-2xl overflow-hidden max-h-[350px] w-full border border-zinc-200/50 dark:border-zinc-800/40 shadow-sm">
      {images.slice(0, 4).map((img, idx) => {
        const isFourth = idx === 3;
        const extraCount = images.length - 4;
        return (
          <div
            key={idx}
            onClick={() => onOpen(idx)}
            className="w-full h-full min-h-[120px] max-h-[170px] bg-zinc-150 dark:bg-zinc-900 cursor-zoom-in overflow-hidden relative group/img"
          >
            <img
              src={img}
              alt={`Attachment ${idx + 1}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-102"
            />
            {isFourth && extraCount > 0 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg select-none">
                +{extraCount}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
