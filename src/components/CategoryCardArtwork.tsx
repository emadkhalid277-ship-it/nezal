import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
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
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  // Clean Nizal surface when no custom image has been uploaded yet by the admin
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-[#14543D] flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FFFFFF]/10 border border-[#FFFFFF]/15 flex items-center justify-center mb-2 text-[#F3F5E9]/70 transition-transform duration-300 group-hover:scale-105">
        <ImageIcon className="w-6 h-6" />
      </div>
      <span className="text-[11px] font-medium text-[#F3F5E9]/55">
        بدون صورة مرفوعة
      </span>
    </div>
  );
};
