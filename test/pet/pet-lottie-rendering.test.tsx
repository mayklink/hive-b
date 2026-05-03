import { render, screen, waitFor } from '@testing-library/react'
import type * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DotLottie } from '@lottiefiles/dotlottie-web'
import type { LoadedPet, PetSettings } from '@shared/types/pet'
import { getPet } from '@/pet/registry'
import { PetSprite } from '@/pet/PetSprite'

vi.mock('motion/react', () => ({
  motion: {
    span: ({
      children,
      animate: _animate,
      transition: _transition,
      ...props
    }: React.ComponentProps<'span'> & { animate?: unknown; transition?: unknown }) => (
      <span {...props}>{children}</span>
    )
  }
}))

vi.mock('@lottiefiles/dotlottie-web', () => ({
  DotLottie: Object.assign(
    vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      destroy: vi.fn(),
      resize: vi.fn()
    })),
    { setWasmUrl: vi.fn() }
  )
}))

vi.mock('@lottiefiles/dotlottie-web/dotlottie-player.wasm?url', () => ({
  default: '/assets/dotlottie-player.wasm'
}))

const settings: PetSettings = {
  enabled: true,
  petId: 'bee',
  size: 'M',
  opacity: 1,
  hasHatched: true
}

describe('pet Lottie rendering', () => {
  beforeEach(() => {
    vi.mocked(DotLottie).mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a working-state Lottie asset for the bee pet', () => {
    const pet = getPet('bee')

    expect(pet.resolvedLottieAssets?.working).toContain('honey-bee')
  })

  it('renders Lottie only for working and keeps other states on the PNG sprite', async () => {
    const pet = {
      id: 'bee',
      name: 'Bee',
      version: '1.0.0',
      assets: {
        idle: '/bee.png',
        working: '/bee.png',
        question: '/bee.png',
        permission: '/bee.png',
        plan_ready: '/bee.png'
      },
      resolvedAssets: {
        idle: '/bee.png',
        working: '/bee.png',
        question: '/bee.png',
        permission: '/bee.png',
        plan_ready: '/bee.png'
      },
      resolvedLottieAssets: {
        working: '/honey-bee.lottie'
      }
    } satisfies LoadedPet

    const { container, rerender } = render(
      <PetSprite
        pet={pet}
        state="working"
        settings={settings}
        onPointerDown={vi.fn()}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    )

    expect(screen.getByTestId('pet-lottie-working')).toBeInTheDocument()
    expect(container.querySelector('img.pet-lottie-fallback')).toBeInTheDocument()
    await waitFor(() => expect(DotLottie).toHaveBeenCalledTimes(1))

    expect(DotLottie).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(ArrayBuffer),
        autoplay: true,
        loop: true,
        renderConfig: expect.objectContaining({
          autoResize: true,
          freezeOnOffscreen: false
        })
      })
    )
    expect(vi.mocked(DotLottie).mock.calls[0]?.[0]).not.toHaveProperty('src')
    expect(DotLottie.setWasmUrl).toHaveBeenCalledWith('/assets/dotlottie-player.wasm')

    rerender(
      <PetSprite
        pet={pet}
        state="question"
        settings={settings}
        onPointerDown={vi.fn()}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    )

    expect(screen.queryByTestId('pet-lottie-working')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeInTheDocument()
  })
})
