import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'color';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'showcase';
  showSubtitle?: boolean;
  layout?: 'horizontal' | 'vertical' | 'emblem';
}

interface EmblemProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  variant?: 'color' | 'light';
}

/**
 * VictoriaEmblem: Faithful vector artwork of "A Casa com o Pinheiro"
 * Matches the official Victoria Lar Residencial brand identity:
 * - Satin gold gable roof outline with left eave return and 4-pane window
 * - Botanical, lush, multi-tiered evergreen pine tree (Araucária / Pinheiro)
 * - Harmonious double swooshes: top gold wave flowing into an upward crescent flick,
 *   and bottom forest green foundation wave.
 */
export const VictoriaEmblem: React.FC<EmblemProps> = ({
  width = 80,
  height = 54,
  className = '',
  variant = 'color',
}) => {
  const isLight = variant === 'light';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 280 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Warm Metallic Gold Roof Gradient */}
        <linearGradient id="vicBrushedGoldRoof" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E5C784" />
          <stop offset="30%" stopColor="#C8A25D" />
          <stop offset="65%" stopColor="#B38938" />
          <stop offset="100%" stopColor="#966F26" />
        </linearGradient>

        {/* Dynamic Upper Gold Wave Gradient */}
        <linearGradient id="vicBrushedGoldWave" x1="0%" y1="0%" x2="100%" y2="35%">
          <stop offset="0%" stopColor="#A47B2C" />
          <stop offset="25%" stopColor="#C9A35E" />
          <stop offset="55%" stopColor="#EAD092" />
          <stop offset="80%" stopColor="#D9B772" />
          <stop offset="100%" stopColor="#F3DC9F" />
        </linearGradient>

        {/* Deep Forest Green Wave Gradient */}
        <linearGradient id="vicForestGreenWave" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B2015" />
          <stop offset="45%" stopColor="#173D2B" />
          <stop offset="100%" stopColor="#25553C" />
        </linearGradient>

        {/* Pine needles depth & highlight gradients */}
        <linearGradient id="vicPineHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#357855" />
          <stop offset="100%" stopColor="#173D2B" />
        </linearGradient>

        <linearGradient id="vicPineSunlight" x1="0%" y1="0%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#4A996D" />
          <stop offset="100%" stopColor="#276144" />
        </linearGradient>
      </defs>

      {/* ------------------------------------------------------------- */}
      {/* 1. THE HOUSE (A Casa em Dourado Metálico com Janela 4 Vidraças) */}
      {/* ------------------------------------------------------------- */}
      {/* Roof Gable Structure: Sloped outer/inner beams with crisp peak */}
      <path
        d="M 66 98 L 66 90 L 75 90 L 118 52 L 148 76 L 141 82 L 118 64 L 84 94 L 84 104 L 75 104 L 75 98 Z"
        fill="url(#vicBrushedGoldRoof)"
      />

      {/* 4-Pane Square Window Centered in Gable */}
      <g fill="url(#vicBrushedGoldRoof)">
        <rect x="104.5" y="70" width="7" height="7" rx="0.8" />
        <rect x="114" y="70" width="7" height="7" rx="0.8" />
        <rect x="104.5" y="79.5" width="7" height="7" rx="0.8" />
        <rect x="114" y="79.5" width="7" height="7" rx="0.8" />
      </g>

      {/* ------------------------------------------------------------- */}
      {/* 2. THE PINE TREE (O Pinheiro com Agulhas Naturais e Frondes)    */}
      {/* ------------------------------------------------------------- */}
      {/* Trunk anchored into the golden wave */}
      <path
        d="M 166 112 L 165 128 C 167 129, 171 129, 173 128 L 172 112 Z"
        fill="#122519"
      />

      {/* Botanical Pine Foliage - Base Dense Silhouette */}
      <path
        d="M 169 16 
           L 165 24 L 167 24 L 162 32 L 166 31 L 159 40 L 165 39 L 157 49 L 163 48 L 153 59 L 161 58 L 149 71 L 158 69 L 144 84 L 156 82 L 138 98 L 151 96 L 132 114 C 145 115, 165 117, 169 117 C 173 117, 193 115, 206 114 L 187 96 L 200 98 L 182 82 L 194 84 L 180 69 L 189 71 L 177 58 L 185 59 L 175 48 L 181 49 L 173 39 L 179 40 L 172 31 L 176 32 L 171 24 L 173 24 Z"
        fill={isLight ? '#22563D' : '#153A28'}
      />

      {/* Pine Needle Clusters - Shadow & Mid-Depth Fronds */}
      <path
        d="M 169 18 
           L 166 25 L 168 24 L 163 33 L 167 32 L 160 42 L 166 41 L 158 51 L 164 50 L 154 62 L 162 60 L 151 73 L 160 71 L 146 87 L 158 84 L 140 101 L 153 98 L 134 113 C 146 114, 165 115, 169 115 C 173 115, 192 114, 204 113 L 185 98 L 198 101 L 180 84 L 192 87 L 178 71 L 187 73 L 176 60 L 184 62 L 174 50 L 180 51 L 172 41 L 178 42 L 171 32 L 175 33 L 170 24 L 172 25 Z"
        fill="#0E2419"
      />

      {/* Pine Needle Clusters - Natural Evergreen Texture & Fine Branchlets */}
      <path
        d="M 169 20 
           L 167 27 L 169 26 L 165 35 L 169 34 L 162 44 L 167 43 L 160 54 L 166 52 L 157 65 L 164 63 L 153 76 L 162 74 L 149 89 L 160 87 L 144 104 L 157 101 L 138 112 C 149 113, 166 114, 169 114 C 172 114, 189 113, 200 112 L 181 101 L 194 104 L 178 87 L 189 89 L 176 74 L 185 76 L 174 63 L 181 65 L 172 52 L 178 54 L 171 43 L 176 44 L 170 34 L 174 35 L 169 26 Z"
        fill="url(#vicPineHighlight)"
        opacity="0.95"
      />

      {/* Pine Needle Highlights - Sunlit Needle Sprays on the Outer Boughs */}
      <path
        d="M 169 25 L 167 30 L 170 33 L 165 41 L 170 40 L 163 50 L 168 49 L 159 60 L 166 59 L 155 72 L 164 70 L 152 84 L 162 82 L 147 98 L 158 96 L 142 110 C 151 111, 165 112, 169 112 C 173 112, 187 111, 196 110 L 180 96 L 191 98 L 176 82 L 186 84 L 174 70 L 183 72 L 172 59 L 179 60 L 170 49 L 175 50 L 168 40 L 173 41 L 168 33 Z"
        fill="url(#vicPineSunlight)"
        opacity="0.65"
      />

      {/* ------------------------------------------------------------- */}
      {/* 3. DYNAMIC FOUNDATION SWOOSHES (As Ondas Dourada e Verde)       */}
      {/* ------------------------------------------------------------- */}
      {/* Upper Gold Wave: Curves under house and pine, sweeping up in an elegant crescent tail */}
      <path
        d="M 85 99 
           C 108 96, 138 99, 164 106 
           C 190 112, 214 104, 238 78 
           C 228 102, 198 122, 168 118 
           C 140 115, 112 108, 85 99 Z"
        fill="url(#vicBrushedGoldWave)"
      />

      {/* Bottom Forest Green Wave: Harmonious foundation hill flowing from left to center */}
      <path
        d="M 44 114 
           C 78 98, 120 100, 160 111 
           C 185 118, 204 122, 215 124 
           C 190 134, 150 136, 112 127 
           C 76 119, 56 117, 44 114 Z"
        fill="url(#vicForestGreenWave)"
      />
    </svg>
  );
};

export const VictoriaLogo: React.FC<LogoProps> = ({
  className = '',
  variant = 'color',
  size = 'md',
  showSubtitle = true,
  layout = 'horizontal', // Defaults to horizontal in header as requested
}) => {
  const isLight = variant === 'light';
  const primaryColor = isLight ? '#FAF9F5' : '#173D2B';
  const goldColor = isLight ? '#DFC282' : '#B8954A';

  // Dimension scaling
  const sizeMap = {
    sm: {
      svgWidth: 58,
      svgHeight: 38,
      title: 'text-sm sm:text-base tracking-[0.14em]',
      sub: 'text-[7.5px] sm:text-[8px] tracking-[0.24em]',
    },
    md: {
      svgWidth: 76,
      svgHeight: 50,
      title: 'text-base sm:text-lg tracking-[0.16em]',
      sub: 'text-[8.5px] sm:text-[9.5px] tracking-[0.26em]',
    },
    lg: {
      svgWidth: 100,
      svgHeight: 66,
      title: 'text-xl sm:text-2xl tracking-[0.18em]',
      sub: 'text-[10px] sm:text-[11px] tracking-[0.28em]',
    },
    xl: {
      svgWidth: 140,
      svgHeight: 92,
      title: 'text-2xl sm:text-3xl tracking-[0.2em]',
      sub: 'text-[12px] sm:text-[13px] tracking-[0.3em]',
    },
    hero: {
      svgWidth: 260,
      svgHeight: 170,
      title: 'text-3xl sm:text-4xl tracking-[0.22em]',
      sub: 'text-[14px] sm:text-[15px] tracking-[0.32em]',
    },
    showcase: {
      svgWidth: 340,
      svgHeight: 220,
      title: 'text-3xl sm:text-4xl lg:text-5xl tracking-[0.24em]',
      sub: 'text-[15px] sm:text-[16px] tracking-[0.34em]',
    },
  }[size];

  if (layout === 'emblem') {
    return (
      <VictoriaEmblem
        width={sizeMap.svgWidth}
        height={sizeMap.svgHeight}
        className={className}
        variant={variant === 'light' ? 'light' : 'color'}
      />
    );
  }

  // Horizontal layout: Exactly as shown in the user's attached image (cabeçalho)
  // Left: Emblem (Casa com o Pinheiro)
  // Right: VICTORIA (dark green serif) \n LAR RESIDENCIAL (gold sans-serif)
  if (layout === 'horizontal') {
    return (
      <div className={`inline-flex items-center gap-3 sm:gap-4 select-none ${className}`}>
        <VictoriaEmblem
          width={sizeMap.svgWidth}
          height={sizeMap.svgHeight}
          variant={variant === 'light' ? 'light' : 'color'}
          className="transition-transform duration-300 hover:scale-105"
        />
        <div className="flex flex-col justify-center items-start text-left">
          <span
            className={`font-serif font-bold uppercase leading-none ${sizeMap.title}`}
            style={{
              color: primaryColor,
              fontFamily: "'Cinzel', 'Playfair Display', Georgia, 'Times New Roman', serif",
            }}
          >
            VICTORIA
          </span>
          {showSubtitle && (
            <span
              className={`font-sans font-semibold uppercase leading-none mt-1 sm:mt-1.5 ${sizeMap.sub}`}
              style={{
                color: goldColor,
                fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
              }}
            >
              LAR RESIDENCIAL
            </span>
          )}
        </div>
      </div>
    );
  }

  // Vertical layout: Centered lockup (used in Hero showcase, Footer, etc.)
  return (
    <div className={`flex flex-col items-center text-center select-none ${className}`}>
      <VictoriaEmblem
        width={sizeMap.svgWidth}
        height={sizeMap.svgHeight}
        variant={variant === 'light' ? 'light' : 'color'}
        className="transition-transform duration-300 hover:scale-105"
      />
      <div className="flex flex-col items-center mt-3 sm:mt-4">
        <span
          className={`font-serif font-bold uppercase leading-none ${sizeMap.title}`}
          style={{
            color: primaryColor,
            fontFamily: "'Cinzel', 'Playfair Display', Georgia, 'Times New Roman', serif",
          }}
        >
          VICTORIA
        </span>
        {showSubtitle && (
          <span
            className={`font-sans font-semibold uppercase leading-none mt-1.5 sm:mt-2 ${sizeMap.sub}`}
            style={{
              color: goldColor,
              fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
            }}
          >
            LAR RESIDENCIAL
          </span>
        )}
      </div>
    </div>
  );
};
