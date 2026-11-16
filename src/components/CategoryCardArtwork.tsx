import React, { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';
import { MainCategoryName } from '../types/game';

interface CategoryCardArtworkProps {
  name: string;
  mainCategory?: MainCategoryName;
  imageUrl?: string;
  isMainCategory?: boolean;
  className?: string;
}

export const CategoryCardArtwork: React.FC<CategoryCardArtworkProps> = ({
  name,
  imageUrl,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  const cleanUrl = (imageUrl || '').trim();
  const hasValidImage = cleanUrl.length > 0 && !imgError;

  if (hasValidImage) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden bg-[#14543D] ${className}`}
      >
        <img
          src={cleanUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  // Clean Nizal emerald surface when no custom image has been uploaded yet
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-br from-[#14543D] via-[#124833] to-[#0D3828] flex items-center justify-center p-3 select-none ${className}`}
    >
      <div
        aria-hidden="true"
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FFFFFF]/10 border border-[#FFFFFF]/15 flex items-center justify-center text-[#F3F5E9]/70 transition-transform duration-300 group-hover:scale-105"
      >
        <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
    </div>
  );
};
