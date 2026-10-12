/**
 * Wingman AI - Dynamic Island Component
 * The main UI that morphs between different states with resizing support
 */

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store/appStore'
import NanoState from './NanoState'
import MiniState from './MiniState'
import NormalState from './NormalState'
import ExpandedState from './ExpandedState'
import { islandVariants, contentVariants } from './animations'

// Size presets for each state
const SIZE_PRESETS = {
  nano: { width: 60, height: 40, minW: 60, minH: 40 },
  mini: { width: 140, height: 44, minW: 100, minH: 40 },
  normal: { width: 420, height: 64, minW: 300, minH: 50 },
  expanded: { width: 600, height: 450, minW: 400, minH: 300, maxW: 1200, maxH: 800 },
  fullscreen: { width: 900, height: 650, minW: 600, minH: 400, maxW: 1400, maxH: 900 }
}

const DynamicIsland = () => {
  const { islandState, isPaused } = useAppStore()
  
  // Custom size for expanded/fullscreen states
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null)
  const [isResizing, setIsResizing] = useState(false)

  // Reset custom size when state changes
  useEffect(() => {
    if (islandState !== 'expanded' && islandState !== 'fullscreen') {
      setCustomSize(null)
    }
  }, [islandState])

  const getIslandSize = () => {
    const preset = SIZE_PRESETS[islandState] || SIZE_PRESETS.nano
    
    // Use custom size for expanded/fullscreen if set
    if ((islandState === 'expanded' || islandState === 'fullscreen') && customSize) {
      return customSize
    }
    
    return { width: preset.width, height: preset.height }
  }

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (islandState !== 'expanded' && islandState !== 'fullscreen') return
    
    setIsResizing(true)
    const startX = e.clientX
    const startY = e.clientY
    const startSize = customSize || getIslandSize()
    const preset = SIZE_PRESETS[islandState]

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let newWidth = startSize.width
      let newHeight = startSize.height

      // Calculate delta based on direction
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      if (direction.includes('e')) newWidth = startSize.width + deltaX
      if (direction.includes('w')) newWidth = startSize.width - deltaX
      if (direction.includes('s')) newHeight = startSize.height + deltaY
      if (direction.includes('n')) newHeight = startSize.height - deltaY

      // Clamp to min/max
      newWidth = Math.max(preset.minW, Math.min(preset.maxW || 1400, newWidth))
      newHeight = Math.max(preset.minH, Math.min(preset.maxH || 900, newHeight))

      setCustomSize({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [islandState, customSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const size = getIslandSize()
  const canResize = islandState === 'expanded' || islandState === 'fullscreen'

  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{
        width: size.width,
        height: size.height
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30
      }}
    >
      {/* Main Island Container - Draggable */}
      <motion.div
        className={`
          relative w-full h-full rounded-[22px]
          bg-black/85 backdrop-blur-xl
          border border-white/10
          shadow-island
          ${!isResizing ? 'cursor-move' : ''}
          ${isPaused ? 'opacity-60' : ''}
        `}
        style={{ overflow: islandState === 'expanded' || islandState === 'fullscreen' ? 'hidden' : 'visible' }}
        variants={islandVariants}
        initial="initial"
        animate="animate"
        drag={!isResizing}
        dragMomentum={false}
        dragElastic={0}
        onMouseEnter={() => window.wingman?.window.mouseEnterIsland()}
        onMouseLeave={() => window.wingman?.window.mouseLeaveIsland()}
      >
        {/* Content based on state */}
        <AnimatePresence mode="wait">
          <motion.div
            key={islandState}
            className="w-full h-full"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {islandState === 'nano' && <NanoState />}
            {islandState === 'mini' && <MiniState />}
            {islandState === 'normal' && <NormalState />}
            {(islandState === 'expanded' || islandState === 'fullscreen') && (
              <ExpandedState />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Resize handles - only for expanded/fullscreen */}
        {canResize && (
          <>
            {/* Corner handles */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 hover:bg-wingman-500/20 rounded-br-[22px]"
              onMouseDown={(e) => handleResizeStart(e, 'se')}
            >
              <svg className="w-3 h-3 absolute bottom-1 right-1 text-white/30" viewBox="0 0 10 10">
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-50 hover:bg-wingman-500/20 rounded-bl-[22px]"
              onMouseDown={(e) => handleResizeStart(e, 'sw')}
            />
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-50 hover:bg-wingman-500/20 rounded-tr-[22px]"
              onMouseDown={(e) => handleResizeStart(e, 'ne')}
            />
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-50 hover:bg-wingman-500/20 rounded-tl-[22px]"
              onMouseDown={(e) => handleResizeStart(e, 'nw')}
            />
            
            {/* Edge handles */}
            <div
              className="absolute top-4 bottom-4 right-0 w-2 cursor-e-resize z-50 hover:bg-wingman-500/20"
              onMouseDown={(e) => handleResizeStart(e, 'e')}
            />
            <div
              className="absolute top-4 bottom-4 left-0 w-2 cursor-w-resize z-50 hover:bg-wingman-500/20"
              onMouseDown={(e) => handleResizeStart(e, 'w')}
            />
            <div
              className="absolute left-4 right-4 bottom-0 h-2 cursor-s-resize z-50 hover:bg-wingman-500/20"
              onMouseDown={(e) => handleResizeStart(e, 's')}
            />
            <div
              className="absolute left-4 right-4 top-0 h-2 cursor-n-resize z-50 hover:bg-wingman-500/20"
              onMouseDown={(e) => handleResizeStart(e, 'n')}
            />
          </>
        )}
      </motion.div>

      {/* Paused indicator */}
      {isPaused && (
        <motion.div
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/50"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Paused
        </motion.div>
      )}

      {/* Size indicator when resizing */}
      {isResizing && (
        <motion.div
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-wingman-400 bg-black/80 px-2 py-1 rounded"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {Math.round(size.width)} × {Math.round(size.height)}
        </motion.div>
      )}
    </motion.div>
  )
}

export default DynamicIsland
