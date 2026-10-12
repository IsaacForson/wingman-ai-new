/**
 * Wingman AI - Dynamic Island Animations
 * Framer Motion animation variants
 */

import { Variants } from 'framer-motion'

export const islandVariants: Variants = {
  initial: {
    opacity: 0,
    y: -10
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2
    }
  }
}

export const contentVariants: Variants = {
  initial: {
    opacity: 0
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: 'easeOut'
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.15
    }
  }
}

export const textVariants: Variants = {
  initial: {
    opacity: 0,
    y: 10
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut'
    }
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2
    }
  }
}

export const waveformVariants: Variants = {
  listening: {
    scaleY: [0.3, 1, 0.3],
    transition: {
      duration: 0.5,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  },
  idle: {
    scaleY: 0.3
  }
}

export const pulseVariants: Variants = {
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [0.8, 1, 0.8],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
}

export const shimmerVariants: Variants = {
  shimmer: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear'
    }
  }
}

export const slideUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20
  },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: 'easeOut'
    }
  }),
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2
    }
  }
}

export const expandVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: {
        type: 'spring',
        stiffness: 300,
        damping: 30
      },
      opacity: {
        duration: 0.2
      }
    }
  }
}

export const buttonVariants: Variants = {
  initial: {
    scale: 1
  },
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.2
    }
  },
  tap: {
    scale: 0.95
  }
}

export const iconVariants: Variants = {
  initial: {
    rotate: 0
  },
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear'
    }
  }
}

